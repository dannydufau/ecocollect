// Q8 against the test database, checked against openapi.yaml.
// Needs: backend/scripts/request/load-db.sh ecocollect_request_test,
// REQUEST_TEST_DATABASE_URL (see db.ts), and `npm ci` in contracts/.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skipDb } from './db.ts';
import {
  SEED_ASSIGNED_REQUEST_ID, SEED_CANCELLED_VOLUNTEER_ID, SEED_DELIVERED_EVIDENCE_PATH,
  SEED_DELIVERED_PHOTO_PATH, SEED_DELIVERED_REQUEST_ID, SEED_OPEN_REQUEST_ID,
} from './seed.ts';
import { fakePhotos } from '../../src/request/imagekit/fake.ts';
import {
  contractChecks, otherResident, owner, startApp, volunteer, type App, type ContractChecks,
} from './helpers.ts';

const cancelledVolunteer = { 'X-User-Id': SEED_CANCELLED_VOLUNTEER_ID, 'X-User-Roles': 'volunteer' };

type Detail = {
  requestId: string; viewer: string; address?: unknown; statusHistory?: unknown[];
  photoUrl: string | null; delivery?: { evidencePhotoUrl?: string } | null;
};

describe('Q8 request detail', { skip: skipDb }, () => {
  let app: App;
  let check: ContractChecks;
  before(async () => {
    check = await contractChecks('get', '/api/requests/{id}');
    app = startApp({ imagekit: fakePhotos });
  });
  after(() => app.close());

  test('the owner gets the full detail; a volunteer on an Open request gets no address or history', async () => {
    const own = await app.call('GET', `/api/requests/${SEED_DELIVERED_REQUEST_ID}`, owner);
    assert.equal(own.status, 200);
    assert.ok(check.isOk(own.body));
    const detail = own.body as Detail;
    assert.equal(detail.requestId, SEED_DELIVERED_REQUEST_ID);
    assert.equal(detail.viewer, 'owner');
    assert.ok(detail.address && detail.statusHistory);
    assert.equal(detail.photoUrl, fakePhotos.sign(SEED_DELIVERED_PHOTO_PATH));
    assert.equal(detail.delivery?.evidencePhotoUrl, fakePhotos.sign(SEED_DELIVERED_EVIDENCE_PATH));

    const open = await app.call('GET', `/api/requests/${SEED_OPEN_REQUEST_ID}`, volunteer);
    assert.equal(open.status, 200);
    assert.ok(check.isOk(open.body));
    const seen = open.body as Detail;
    assert.equal(seen.viewer, 'volunteer');
    assert.equal(seen.address, undefined);
    assert.equal(seen.statusHistory, undefined);
    assert.equal(seen.photoUrl, fakePhotos.sign(SEED_DELIVERED_PHOTO_PATH));
  });

  test('another resident, a cancelled volunteer and a malformed id all get the same 404', async () => {
    for (const [id, caller] of [
      [SEED_OPEN_REQUEST_ID, otherResident],
      [SEED_ASSIGNED_REQUEST_ID, cancelledVolunteer],
      ['not-a-uuid', owner],
    ] as const) {
      const res = await app.call('GET', `/api/requests/${id}`, caller);
      check.expectError(res, 404, 'request_unavailable', `${id} as ${caller['X-User-Id']}`);
    }
  });
});
