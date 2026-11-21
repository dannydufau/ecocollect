// Q15 against the test database, checked against openapi.yaml. Builds its own
// Assigned request through Q4, Q8 and Q11 (and collects it with Q13), so it runs
// again without a rebuild. The photo check is imagekit/fake.ts, except where the
// default (no ImageKit yet) is tested. Needs: backend/scripts/request/load-db.sh
// ecocollect_request_test, REQUEST_TEST_DATABASE_URL (see db.ts), and `npm ci` in contracts/.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fakePhotos } from '../../src/request/imagekit/fake.ts';
import { skipDb } from './db.ts';
import { SEED_CATEGORY_ID } from './seed.ts';
import {
  contractChecks, createAssigned, otherVolunteer, owner, startApp, volunteer,
  type App, type ContractChecks, type ErrorBody,
} from './helpers.ts';

type Detail = { status: string; allowedActions: string[]; delivery?: { facility: { facilityId: string } } | null };

describe('Q15 record delivery', { skip: skipDb }, () => {
  let app: App;                        // with fakePhotos
  let noImageKit: App;                 // the default: every photo refused
  let check: ContractChecks;
  let requestId: string;
  let facilityId: string;
  before(async () => {
    check = await contractChecks('post', '/api/requests/{id}/assignment/delivery');
    app = startApp({ imagekit: fakePhotos });
    noImageKit = startApp();
    requestId = await createAssigned(app.call, owner, volunteer);

    // A facility that accepts the category (Q2).
    const facilities = await app.call('GET', `/api/facilities?categoryId=${SEED_CATEGORY_ID}`, volunteer);
    facilityId = (facilities.body as { facilityId: string }[])[0]!.facilityId;
  });
  after(async () => { await app.close(); await noImageKit.close(); });

  test('403 for another volunteer; 409 not_collected; 400 without ImageKit; 200 after collection; then 409', async () => {
    const path = `/api/requests/${requestId}/assignment/delivery`;
    const body = { facilityId, evidencePhoto: { fileId: `test-${requestId}` } };

    check.expectError(await app.call('POST', path, otherVolunteer, body), 403, 'forbidden');
    check.expectError(await app.call('POST', path, volunteer, body), 409, 'not_collected');

    assert.equal((await app.call('POST', `/api/requests/${requestId}/assignment/collected`, owner)).status, 200);

    const refused = await noImageKit.call('POST', path, volunteer, body);
    check.expectError(refused, 400, 'validation_failed');
    assert.deepEqual(Object.keys((refused.body as ErrorBody).error.details?.fields ?? {}), ['evidencePhoto.fileId']);

    const delivered = await app.call('POST', path, volunteer, body);
    assert.equal(delivered.status, 200);
    assert.ok(check.isOk(delivered.body));
    const detail = delivered.body as Detail;
    assert.equal(detail.status, 'Delivered');
    assert.equal(detail.delivery?.facility.facilityId, facilityId);
    assert.deepEqual(detail.allowedActions, []);

    check.expectError(await app.call('POST', path, volunteer, body), 409, 'already_delivered');
  });
});
