// The optional `reason` of Q10 cancel, Q12 cancel assignment and Q14 report
// missed: the one place that knows its limit and its blank rule. The database
// stores what normaliseReason returns and has no limit of its own.
//
// The 500 limit is a proposed contract change (issue #365, PR #366). To remove it:
//   1. Remove #366's maxLength on reason from the contract (openapi, asyncapi, README).
//   2. Delete REASON_MAX_CHARS below.
//   3. Replace the Reason pipe with: export const Reason = v.string('must be a string');
//   4. Remove the limit lines from these comments.
//   5. Remove the "longer than REASON_MAX_CHARS" case from cancel.test.ts.
//   6. Run the request tests (npm run typecheck, npm run test:request).
// To change the number only: edit REASON_MAX_CHARS, and maxLength in the contract.
import * as v from 'valibot';

export const REASON_MAX_CHARS = 500;

// Counted in code points ([...s].length), as JSON Schema's maxLength and
// Postgres's char_length count. Not v.maxLength: it counts UTF-16 units, so an
// emoji would count twice. Checked on the string as sent, before trimming.
export const Reason = v.pipe(
  v.string('must be a string'),
  v.check((s) => [...s].length <= REASON_MAX_CHARS, `must be at most ${REASON_MAX_CHARS} characters`),
);

// Not sent, empty or only whitespace -> null; anything else is kept as sent.
export function normaliseReason(reason: string | undefined): string | null {
  if (reason === undefined || reason.trim() === '') return null;
  return reason;
}
