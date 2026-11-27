// Facility eligibility, historical delivery preservation, and catalogue validation tests.
// Needs: backend/scripts/request/load-db.sh --test, REQUEST_TEST_DATABASE_URL (see db.ts).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { fakePhotos } from '../../src/request/imagekit/fake.ts';
import { skipDb, testAdminDatabaseUrl } from './db.ts';
import { SEED_CATEGORY_ID } from './seed.ts';
import {
  createAssigned, owner, startApp, volunteer,
  type App, type ErrorBody,
} from './helpers.ts';

const EAST_CALGARY_ID = '00000006-0000-4000-8000-000000000101';

describe('facility eligibility and catalogue validation', { skip: skipDb }, () => {
  let app: App;
  let admin: pg.Pool;

  before(() => {
    app = startApp({ imagekit: fakePhotos });
    admin = new pg.Pool({ connectionString: testAdminDatabaseUrl });
  });
  after(async () => {
    await app.close();
    await admin.end();
  });

  test('retiring a facility hides it from Q2 and blocks new deliveries while preserving historical deliveries', async () => {
    // Deliver a request to an active facility first.
    const firstId = await createAssigned(app.call, owner, volunteer);
    assert.equal((await app.call('POST', `/api/requests/${firstId}/assignment/collected`, owner)).status, 200);
    const listBefore = await app.call('GET', `/api/facilities?categoryId=${SEED_CATEGORY_ID}`, volunteer);
    const targetId = (listBefore.body as { facilityId: string }[])[0]!.facilityId;

    const delivered = await app.call('POST', `/api/requests/${firstId}/assignment/delivery`, volunteer, {
      facilityId: targetId,
      evidencePhoto: { fileId: `hist-${firstId}` },
    });
    assert.equal(delivered.status, 200);

    // Add a second temporary facility so we can disable targetId without losing all coverage.
    const backupId = '00000006-0000-4000-8000-000000000999';
    await admin.query(
      `INSERT INTO requests.recycling_facility (facility_id, name, street, postal_code, is_enabled)
       VALUES ($1, 'Temp Backup Depot', '99 Backup Way NW', 'T2N1N4', TRUE)
       ON CONFLICT (facility_id) DO UPDATE SET is_enabled = TRUE`,
      [backupId],
    );
    await admin.query(
      `INSERT INTO requests.facility_accepts (facility_id, category_id, is_enabled)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (facility_id, category_id) DO UPDATE SET is_enabled = TRUE`,
      [backupId, SEED_CATEGORY_ID],
    );

    try {
      await admin.query('UPDATE requests.recycling_facility SET is_enabled = FALSE WHERE facility_id = $1', [targetId]);

      // Q2 no longer lists the retired facility.
      const listAfter = await app.call('GET', `/api/facilities?categoryId=${SEED_CATEGORY_ID}`, volunteer);
      const ids = (listAfter.body as { facilityId: string }[]).map((f) => f.facilityId);
      assert.ok(!ids.includes(targetId), 'retired facility must not appear in Q2');

      // New delivery to the retired facility is rejected with 400 validation_failed on facilityId.
      const secondId = await createAssigned(app.call, owner, volunteer);
      assert.equal((await app.call('POST', `/api/requests/${secondId}/assignment/collected`, owner)).status, 200);
      const refused = await app.call('POST', `/api/requests/${secondId}/assignment/delivery`, volunteer, {
        facilityId: targetId,
        evidencePhoto: { fileId: `retired-${secondId}` },
      });
      assert.equal(refused.status, 400);
      assert.equal((refused.body as ErrorBody).error.code, 'validation_failed');
      assert.ok((refused.body as ErrorBody).error.details?.fields?.facilityId);

      // Historical delivery still reads cleanly via Q8.
      const historical = await app.call('GET', `/api/requests/${firstId}`, volunteer);
      assert.equal(historical.status, 200);
      assert.equal((historical.body as { delivery?: { facility: { facilityId: string } } }).delivery?.facility.facilityId, targetId);
    } finally {
      await admin.query('UPDATE requests.recycling_facility SET is_enabled = TRUE WHERE facility_id = $1', [targetId]);
      await admin.query('DELETE FROM requests.facility_accepts WHERE facility_id = $1', [backupId]);
      await admin.query('DELETE FROM requests.recycling_facility WHERE facility_id = $1', [backupId]);
    }
  });

  test('req_validate_catalogue rolls back an incomplete matrix and load-live-catalogue.sql preserves existing eligibility', async () => {
    const client = await admin.connect();
    try {
      // Incomplete matrix: disabling all facilities must fail validation inside a transaction.
      await client.query('BEGIN');
      await client.query('UPDATE requests.recycling_facility SET is_enabled = FALSE');
      await assert.rejects(
        () => client.query('SELECT requests.req_validate_catalogue()'),
        /catalogue validation failed/,
      );
      await client.query('ROLLBACK');

      // Repeatable live catalogue upgrade runs twice cleanly and inserts Calgary Eco Centres disabled.
      const sql = readFileSync(resolve(__dirname, '../../scripts/request/load-live-catalogue.sql'), 'utf8');
      await client.query(sql);
      await client.query(sql);

      const calgary = await client.query(
        `SELECT facility_id, is_enabled FROM requests.recycling_facility
         WHERE facility_id IN (
           '00000006-0000-4000-8000-000000000101',
           '00000006-0000-4000-8000-000000000102',
           '00000006-0000-4000-8000-000000000103'
         ) ORDER BY facility_id`,
      );
      assert.equal(calgary.rows.length, 3);
      for (const row of calgary.rows) assert.equal(row.is_enabled, false);

      // Enabling a Calgary facility and mapping must be preserved when rerunning the staging seed.
      try {
        await client.query('UPDATE requests.recycling_facility SET is_enabled = TRUE WHERE facility_id = $1', [EAST_CALGARY_ID]);
        await client.query(
          'UPDATE requests.facility_accepts SET is_enabled = TRUE WHERE facility_id = $1 AND category_id = $2',
          [EAST_CALGARY_ID, SEED_CATEGORY_ID],
        );

        await client.query(sql);

        const facilityRow = await client.query(
          'SELECT is_enabled FROM requests.recycling_facility WHERE facility_id = $1',
          [EAST_CALGARY_ID],
        );
        const mappingRow = await client.query(
          'SELECT is_enabled FROM requests.facility_accepts WHERE facility_id = $1 AND category_id = $2',
          [EAST_CALGARY_ID, SEED_CATEGORY_ID],
        );
        assert.equal(facilityRow.rows[0]?.is_enabled, true);
        assert.equal(mappingRow.rows[0]?.is_enabled, true);
      } finally {
        await client.query('UPDATE requests.facility_accepts SET is_enabled = FALSE WHERE facility_id = $1', [EAST_CALGARY_ID]);
        await client.query('UPDATE requests.recycling_facility SET is_enabled = FALSE WHERE facility_id = $1', [EAST_CALGARY_ID]);
      }
    } finally {
      client.release();
    }
  });
});
