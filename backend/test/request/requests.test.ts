// Q4 against the test database, checked against openapi.yaml.
// Needs: backend/scripts/request/load-db.sh ecocollect_request_test, REQUEST_TEST_DATABASE_URL
// (see db.ts), and `npm ci` in contracts/. Each run adds requests to the test database.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { createApp } from '../../src/request/app.ts';
import { createPool } from '../../src/request/db/pool.ts';
import { skipDb, testDatabaseUrl } from './db.ts';
import { SEED_CATEGORY_ID, SEED_CURRENT_TERMS_ID, SEED_RESIDENT_ONLY_ID } from './seed.ts';

// Tomorrow in Calgary: in the future and within 30 days whenever the test runs.
function calgaryTomorrow(): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton' }).format(new Date());
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

describe('Q4 create requests', { skip: skipDb }, () => {
  let pool: pg.Pool;
  let server: Server;
  let base: string;
  let is201: (body: unknown) => boolean;
  before(async () => {
    const { default: contracts } = await import('../../../contracts/test/helpers.js');
    is201 = contracts.inline(contracts.openapi, contracts.responseBody('post', '/api/requests', '201'));
    pool = createPool(testDatabaseUrl);
    server = createApp({ pool }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => { server.close(); await pool.end(); });

  test('201 in the contract shape; a repeat with the same Idempotency-Key replays the same ids', async () => {
    const post = () => fetch(`${base}/api/requests`, {
      method: 'POST',
      headers: {
        'X-User-Id': SEED_RESIDENT_ONLY_ID, 'X-User-Roles': 'resident',
        'Content-Type': 'application/json', 'Idempotency-Key': randomKey,
      },
      body: JSON.stringify({
        items: [{ categoryId: SEED_CATEGORY_ID, quantity: 2 }],
        windows: [{ date: calgaryTomorrow(), startHour: 12 }],
        termsDocumentId: SEED_CURRENT_TERMS_ID,
      }),
    });
    const randomKey = randomUUID();

    const first = await post();
    const body = await first.json() as { requests: { requestId: string; quantity: number }[] };
    assert.equal(first.status, 201);
    assert.ok(is201(body));
    assert.equal(body.requests.length, 1);
    assert.equal(body.requests[0]!.quantity, 2);

    const again = await post();
    assert.equal(again.status, 201);
    assert.deepEqual(await again.json(), body);
  });
});
