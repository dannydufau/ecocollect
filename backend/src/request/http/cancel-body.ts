// Q10 body shape checks (CancelRequest in openapi.yaml), before the database
// call. The body is optional: no body is the same as {}.
import * as v from 'valibot';
import { parseBody } from './body-validation.ts';
import { blankToNull, Reason } from './input-free-text.ts';

const CancelRequest = v.strictObject({
  reason: v.optional(Reason),
});

export type CancelBody = {
  reason: string | null;               // null: not sent, or blank
};

// express.json leaves req.body undefined when there is no body (or it isn't JSON).
export function parseCancelBody(body: unknown): CancelBody {
  const { reason } = parseBody(CancelRequest, body ?? {});
  return { reason: blankToNull(reason) };
}
