// NFR06 reliability check: accepts at the same moment. The case is in
// docs/Final Submission/ENSF607/6. Software quality/cases/nfr/NFR06-reliability.md
// Runs against the Request Service's test database (see ../request/db.ts) and
// creates its own requests, so it changes none of the seeded ones.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skipDb } from '../request/db.ts';
import { SEED_CURRENT_TERMS_ID } from '../request/seed.ts';
import { createOpen, events, otherVolunteer, owner, startApp, volunteer, type App, type ErrorBody } from '../request/helpers.ts';

const ROUNDS = 10;

describe('NFR06 concurrency', { skip: skipDb }, () => {
  let app: App;
  before(() => { app = startApp(); });
  after(() => app.close());

  test('NFR06-P2: two volunteers accepting the same request at once: one assignment, one event', async () => {
    for (let round = 1; round <= ROUNDS; round++) {
      const requestId = await createOpen(app.call, owner);
      const seen = await app.call('GET', `/api/requests/${requestId}`, volunteer);
      const windowId = (seen.body as { windows: { windowId: string }[] }).windows[0]!.windowId;
      const accept = { windowId, termsDocumentId: SEED_CURRENT_TERMS_ID };
      const path = `/api/requests/${requestId}/assignment`;

      // Both accepts are sent before either answers.
      const answers = await Promise.all([
        app.call('POST', path, volunteer, accept),
        app.call('POST', path, otherVolunteer, accept),
      ]);

      const statuses = answers.map((a) => a.status).sort();
      assert.deepEqual(statuses, [201, 409], `round ${round}: one accept wins, the other is refused`);
      const refused = answers.find((a) => a.status === 409)!;
      assert.equal((refused.body as ErrorBody).error.code, 'already_assigned', `round ${round}`);

      const { rows } = await app.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n
           FROM requests.assignment a
           JOIN requests.pickup_window pw ON pw.pickup_window_id = a.pickup_window_id
          WHERE pw.pickup_request_id = $1 AND a.ended_at IS NULL`, [requestId]);
      assert.equal(rows[0]!.n, 1, `round ${round}: one active assignment`);

      // The refused accept rolled back, so the outbox holds the winner's event only.
      assert.deepEqual(await events(app.pool, requestId), ['RequestCreated', 'RequestAssigned'], `round ${round}`);
    }
  });
});
