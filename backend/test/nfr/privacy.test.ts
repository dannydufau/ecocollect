// NFR03 privacy check: who sees the address, the item photo and the delivery evidence,
// at each step of one request. The case is in
// docs/Final Submission/ENSF607/6. Software quality/cases/nfr/NFR03-privacy.md
// Runs against the Request Service's test database (see ../request/db.ts) and
// creates its own request, so it changes none of the seeded ones.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fakePhotos } from '../../src/request/imagekit/fake.ts';
import { skipDb } from '../request/db.ts';
import { SEED_CATEGORY_ID, SEED_CURRENT_TERMS_ID } from '../request/seed.ts';
import { calgaryDay, otherVolunteer, owner, startApp, volunteer, type App, type ErrorBody } from '../request/helpers.ts';

type Detail = {
  address?: unknown;
  photoUrl?: string | null;
  windows: { windowId: string }[];
  delivery?: { evidencePhotoUrl?: string | null } | null;
};

describe('NFR03 privacy', { skip: skipDb }, () => {
  let app: App;
  before(() => { app = startApp({ imagekit: fakePhotos }); });
  after(() => app.close());

  test('NFR03-P3: the address, photo and delivery evidence reach only the people the rules allow, at each step', async () => {
    const detail = async (requestId: string, caller: typeof owner) => app.call('GET', `/api/requests/${requestId}`, caller);
    const unavailable = (res: { status: number; body: unknown }, step: string) => {
      assert.equal(res.status, 404, step);
      assert.equal((res.body as ErrorBody).error.code, 'request_unavailable', step);
    };

    // Photo file ids are unique, so each run uses new ones.
    const run = randomUUID();

    // Open, with an item photo.
    const created = await app.call('POST', '/api/requests', owner, {
      items: [{ categoryId: SEED_CATEGORY_ID, quantity: 1, photo: { fileId: `nfr03-item-${run}` } }],
      windows: [{ date: calgaryDay(1), startHour: 12 }],
      termsDocumentId: SEED_CURRENT_TERMS_ID,
    });
    assert.equal(created.status, 201);
    const requestId = (created.body as { requests: { requestId: string }[] }).requests[0]!.requestId;

    const open = (await detail(requestId, volunteer)).body as Detail;
    assert.ok(open.photoUrl, 'Open: any Volunteer sees the photo');
    assert.equal(open.address, undefined, 'Open: no Volunteer sees the address');

    // Assigned to `volunteer`.
    const accepted = await app.call('POST', `/api/requests/${requestId}/assignment`, volunteer,
      { windowId: open.windows[0]!.windowId, termsDocumentId: SEED_CURRENT_TERMS_ID });
    assert.equal(accepted.status, 201);

    const assigned = (await detail(requestId, volunteer)).body as Detail;
    assert.ok(assigned.address, 'Assigned: the active Volunteer sees the address');
    assert.ok(assigned.photoUrl, 'Assigned: the active Volunteer sees the photo');
    unavailable(await detail(requestId, otherVolunteer), 'Assigned: another Volunteer sees nothing');

    // Collected: the owner confirms the pickup.
    assert.equal((await app.call('POST', `/api/requests/${requestId}/assignment/collected`, owner)).status, 200);

    const collected = (await detail(requestId, volunteer)).body as Detail;
    assert.equal(collected.address, undefined, 'Collected: the address is hidden again from the Volunteer');
    assert.ok(collected.photoUrl, 'Collected: the assigned Volunteer still sees the photo');

    // Delivered, with evidence.
    const facilities = await app.call('GET', `/api/facilities?categoryId=${SEED_CATEGORY_ID}`, volunteer);
    const facilityId = (facilities.body as { facilityId: string }[])[0]!.facilityId;
    const delivered = await app.call('POST', `/api/requests/${requestId}/assignment/delivery`, volunteer,
      { facilityId, evidencePhoto: { fileId: `nfr03-evidence-${run}` } });
    assert.equal(delivered.status, 200);

    assert.ok(((await detail(requestId, owner)).body as Detail).delivery?.evidencePhotoUrl, 'Delivered: the owner sees the evidence');
    assert.ok(((await detail(requestId, volunteer)).body as Detail).delivery?.evidencePhotoUrl, 'Delivered: the delivering Volunteer sees the evidence');
    unavailable(await detail(requestId, otherVolunteer), 'Delivered: another Volunteer sees nothing');
  });
});
