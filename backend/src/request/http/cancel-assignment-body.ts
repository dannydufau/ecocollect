// Q12 body shape checks (CancelAssignment in openapi.yaml), before the database
// call. The body is optional: no body is the same as {}. Whether `as` is needed,
// and whether the caller may send windows, depends on the caller's sides on the
// request: req_cancel_assignment decides both.
import * as v from 'valibot';
import { parseBody } from './body-validation.ts';
import { PickupWindows } from './create-requests-body.ts';
import { normaliseReason, Reason } from './reason.ts';

const CancelAssignment = v.strictObject({
  as: v.optional(v.picklist(['resident', 'volunteer'], 'must be "resident" or "volunteer"')),
  reason: v.optional(Reason),
  windows: v.optional(PickupWindows),
});

export type CancelAssignmentBody = {
  as: 'resident' | 'volunteer' | null; // null: not sent
  reason: string | null;               // null: not sent, or blank
  dates: string[] | null;              // 'YYYY-MM-DD'; null: no windows sent
  hours: number[] | null;              // paired with dates
};

// express.json leaves req.body undefined when there is no body (or it isn't JSON).
export function parseCancelAssignmentBody(body: unknown): CancelAssignmentBody {
  const { as, reason, windows } = parseBody(CancelAssignment, body ?? {});
  return {
    as: as ?? null,
    reason: normaliseReason(reason),
    dates: windows?.map((w) => w.date) ?? null,
    hours: windows?.map((w) => w.startHour) ?? null,
  };
}
