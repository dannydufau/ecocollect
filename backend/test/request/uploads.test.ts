// Q3 against the test database, checked against openapi.yaml. Builds its own
// Assigned request through Q4 and Q11 (and collects it with Q13), so it runs
// again without a rebuild. Tickets come from imagekit/fake.ts (real pinned
// fields, fake token). Needs: backend/scripts/request/load-db.sh
// --test, REQUEST_TEST_DATABASE_URL (see db.ts), and `npm ci` in contracts/.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fakePhotos } from '../../src/request/imagekit/fake.ts';
import { skipDb } from './db.ts';
import {
  contractChecks, createAssigned, otherVolunteer, owner, startApp, volunteer,
  type App, type ContractChecks, type ErrorBody,
} from './helpers.ts';

type Ticket = { fields: { folder: string; fileName: string } };

const UNKNOWN_REQUEST_ID = '00000003-0000-4000-8000-0000000000ff';

describe('Q3 upload ticket', { skip: skipDb }, () => {
  let app: App;
  let check: ContractChecks;
  before(async () => {
    check = await contractChecks('post', '/api/uploads');
    app = startApp({ imagekit: fakePhotos });
  });
  after(async () => { await app.close(); });

  test('item photo: 200 for a resident, in their folder; 403 for a volunteer; 400 for a gif', async () => {
    const body = { purpose: 'item_photo', fileName: 'laptop.jpg', contentType: 'image/jpeg', sizeBytes: 412000 };

    const res = await app.call('POST', '/api/uploads', owner, body);
    assert.equal(res.status, 200);
    assert.ok(check.isOk(res.body));
    const { fields } = res.body as Ticket;
    assert.equal(fields.folder, `/ecocollect/item-photos/${owner['X-User-Id']}/`);
    assert.match(fields.fileName, /^[0-9a-f-]{36}\.jpg$/);

    check.expectError(await app.call('POST', '/api/uploads', volunteer, body), 403, 'forbidden');

    const gif = await app.call('POST', '/api/uploads', owner, { ...body, contentType: 'image/gif' });
    check.expectError(gif, 400, 'validation_failed');
    assert.deepEqual(Object.keys((gif.body as ErrorBody).error.details?.fields ?? {}), ['contentType']);
  });

  test('evidence: 403 before collection; 200 after, in the request folder; 403 / 404 / 400', async () => {
    const requestId = await createAssigned(app.call, owner, volunteer);
    const body = { purpose: 'delivery_evidence', requestId, fileName: 'e.png', contentType: 'image/png', sizeBytes: 1000 };

    check.expectError(await app.call('POST', '/api/uploads', volunteer, body), 403, 'forbidden');
    assert.equal((await app.call('POST', `/api/requests/${requestId}/assignment/collected`, owner)).status, 200);

    const res = await app.call('POST', '/api/uploads', volunteer, body);
    assert.equal(res.status, 200);
    assert.ok(check.isOk(res.body));
    assert.equal((res.body as Ticket).fields.folder,
      `/ecocollect/delivery-evidence/${volunteer['X-User-Id']}/${requestId}/`);

    check.expectError(await app.call('POST', '/api/uploads', otherVolunteer, body), 403, 'forbidden');
    check.expectError(await app.call('POST', '/api/uploads', volunteer, { ...body, requestId: UNKNOWN_REQUEST_ID }),
      404, 'request_unavailable');

    const { requestId: _omitted, ...noRequestId } = body;
    const missing = await app.call('POST', '/api/uploads', volunteer, noRequestId);
    check.expectError(missing, 400, 'validation_failed');
    assert.deepEqual(Object.keys((missing.body as ErrorBody).error.details?.fields ?? {}), ['requestId']);
  });
});
