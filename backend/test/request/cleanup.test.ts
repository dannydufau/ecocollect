// CleanupRequest consumer against the test database: the handler is called
// directly, without RabbitMQ (the shared subscriber has its own tests).
// Needs: backend/scripts/request/load-db.sh --test and
// REQUEST_TEST_DATABASE_URL (see db.ts).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { skipDb } from './db.ts';
import { createOpen, events, moveIntoPast, owner, startApp, type App } from './helpers.ts';
import { cleanupRequestHandler } from '../../src/request/consumers/cleanup.ts';

// A CleanupRequest envelope (asyncapi CleanupRequestPayload) for one request.
const message = (eventId: string, requestId: string) => ({
  eventId, type: 'CleanupRequest', version: 1, producer: 'cleanup-service',
  occurredAt: new Date().toISOString(),
  data: { requestId, requestSeq: 1, expiresAt: new Date().toISOString() },
});

describe('CleanupRequest consumer', { skip: skipDb }, () => {
  let app: App;
  let nudges = 0;
  let handle: (envelope: unknown) => Promise<void>;
  before(() => {
    app = startApp();
    handle = cleanupRequestHandler({ pool: app.pool, nudgePublisher: () => { nudges++; } });
  });
  after(() => app.close());

  const status = async (requestId: string): Promise<string> => {
    const res = await app.call('GET', `/api/requests/${requestId}`, owner);
    return (res.body as { status: string }).status;
  };

  test('expires an overdue Open request once; a redelivery changes nothing', async () => {
    const requestId = await createOpen(app.call, owner);

    // Not due yet: the window is tomorrow.
    await handle(message(randomUUID(), requestId));
    assert.equal(await status(requestId), 'Open');

    // Overdue: expired, with RequestExpired (trigger cleanup_job), and the publisher nudged.
    await moveIntoPast(app.pool, requestId, 2);
    const eventId = randomUUID();
    await handle(message(eventId, requestId));
    assert.equal(await status(requestId), 'Expired');
    assert.deepEqual(await events(app.pool, requestId), ['RequestCreated', 'RequestExpired']);
    const { rows } = await app.pool.query<{ expiry_trigger: string }>(
      `SELECT expiry_trigger FROM requests.outbox
       WHERE pickup_request_id = $1 AND event_type = 'RequestExpired'`, [requestId]);
    assert.equal(rows[0]!.expiry_trigger, 'cleanup_job');
    assert.equal(nudges, 1);

    // The same message again: no new event, no nudge.
    await handle(message(eventId, requestId));
    assert.deepEqual(await events(app.pool, requestId), ['RequestCreated', 'RequestExpired']);
    assert.equal(nudges, 1);
  });

  test('a malformed message throws, so the subscriber retries and then dead-letters it', async () => {
    const requestId = await createOpen(app.call, owner);
    await assert.rejects(handle(message('evt-1', requestId)), /malformed CleanupRequest/);
    await assert.rejects(handle({ ...message(randomUUID(), requestId), data: { requestId } }),
      /malformed CleanupRequest/);
  });
});
