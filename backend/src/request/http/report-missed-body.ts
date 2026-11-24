// Q14 body shape checks (ReportMissed in openapi.yaml), before the database
// call. The body is optional: no body is the same as {}. Whether the terms are
// current and whether the windows are in the future and within 30 days is
// req_report_missed's job.
import * as v from 'valibot';
import { parseBody, Uuid } from './body-validation.ts';
import { PickupWindows } from './create-requests-body.ts';
import { blankToNull, Reason } from './input-free-text.ts';

const ReportMissed = v.strictObject({
  reason: v.optional(Reason),
  reschedule: v.optional(v.strictObject({
    windows: PickupWindows,
    termsDocumentId: v.message(v.pipe(v.string(), v.minLength(1)), 'must be the current terms document id'),
  })),
});

export type ReportMissedBody = {
  reason: string | null;               // null: not sent, or blank
  reschedule: boolean;                 // the body has `reschedule`
  termsDocumentId: string | null;      // null: no reschedule, or not a UUID
  dates: string[] | null;              // 'YYYY-MM-DD'; null: no reschedule
  hours: number[] | null;              // paired with dates
};

// express.json leaves req.body undefined when there is no body (or it isn't JSON).
export function parseReportMissedBody(body: unknown): ReportMissedBody {
  const { reason, reschedule } = parseBody(ReportMissed, body ?? {});

  // A terms id that isn't a UUID can't be cast in the database. It goes in as
  // null instead, and req_report_missed answers 409 terms_outdated after its
  // state checks (as Q11).
  const termsDocumentId = reschedule && v.is(Uuid, reschedule.termsDocumentId)
    ? reschedule.termsDocumentId
    : null;

  return {
    reason: blankToNull(reason),
    reschedule: reschedule !== undefined,
    termsDocumentId,
    dates: reschedule?.windows.map((w) => w.date) ?? null,
    hours: reschedule?.windows.map((w) => w.startHour) ?? null,
  };
}
