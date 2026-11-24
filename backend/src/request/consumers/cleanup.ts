// CleanupRequest consumer: one message from request.cleanup-events, one req_expire
// call. index.ts starts it through the shared subscriber (src/messaging), which
// has already checked the envelope, acks when the handler returns, and requeues
// when it throws (dead-lettered on the 5th failure). A malformed message throws,
// so it ends up in request.cleanup-events.dlq to inspect.
import * as v from 'valibot';
import type pg from 'pg';
import { expire } from '../db/functions.ts';
import { Uuid } from '../http/body-validation.ts';

// contracts/schemas/common.yaml Timestamp: ISO 8601 in UTC with a Z suffix.
const Timestamp = v.pipe(v.string(), v.isoTimestamp(), v.endsWith('Z'));

// The fields this consumer reads (asyncapi CleanupRequestPayload). Not strict:
// extra fields are allowed.
const CleanupRequestMessage = v.object({
  eventId: Uuid,                       // processed_events.event_id is a UUID
  data: v.object({
    requestId: Uuid,
    requestSeq: v.pipe(v.number(), v.integer(), v.minValue(1)),   // for the log only
    expiresAt: Timestamp,                                         // for the log only
  }),
});

type CleanupRequestDeps = {
  pool: pg.Pool;
  nudgePublisher: () => void;          // look at the outbox now, after an expiry
};

export function cleanupRequestHandler({ pool, nudgePublisher }: CleanupRequestDeps) {
  return async function handleCleanupRequest(envelope: unknown): Promise<void> {
    // Check the message's fields; throw if malformed (on one line, for the subscriber's log).
    const parsed = v.safeParse(CleanupRequestMessage, envelope);
    if (!parsed.success) {
      const issues = v.summarize(parsed.issues).replaceAll('\n', ' ');
      throw new Error(`malformed CleanupRequest: ${issues}`);
    }
    const { eventId, data } = parsed.output;

    // Record the event and expire the request if it is still Open and overdue.
    const { result_code } = await expire(pool, data.requestId, eventId);
    if (result_code === 'expired') {
      nudgePublisher();                // RequestExpired is in the outbox
    }

    // Log one line per message, whatever the result.
    console.log(`request cleanup: ${data.requestId} ${result_code}`
      + ` (event ${eventId}, seq ${data.requestSeq}, expiresAt ${data.expiresAt})`);
  };
}
