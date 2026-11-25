// Q4 body checks (CreateRequests in openapi.yaml), before any database call.
// Rules that need the database (category exists, window in the future, within
// 30 days, terms current) are req_create_requests' job.
// Errors come back in stages, each stage reporting all of its failing fields
// (one entry per field, zero-based paths) and stopping the call:
//   1. the body's shape (valibot);
//   2. a repeated categoryId or photo fileId (here);
//   3. an unknown categoryId (the route);
//   4. everything else (req_create_requests).
// Stages 2 and 3 run before any ImageKit call, so a body costs at most one
// check per known category. A rare repeat costs the resident one more try.
import * as v from 'valibot';
import { parseBody, Uuid } from './body-validation.ts';
import { termsOutdated, validationFailed } from './errors.ts';
import { blankToNull, fitsFreeTextLimit } from './input-free-text.ts';

const INT_MAX = 2_147_483_647;         // quantity is an INT parameter

// Runs after v.isoDate(), which checks the format (month 01-12, day 01-31) but
// lets 2026-02-30 through; Postgres would refuse it with an error (a 500).
// Date.UTC rolls it over to March 2, so compare back.
function isCalendarDate(s: string): boolean {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// strictObject = additionalProperties: false: a misspelt field is an error, not
// silently dropped. v.message gives each field one message for any failure.
const PickupWindowInput = v.strictObject({
  date: v.message(v.pipe(v.string(), v.isoDate(), v.check(isCalendarDate)), 'must be a date as YYYY-MM-DD'),
  startHour: v.message(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(23)),
                       'must be a whole number from 0 to 23'),
});

// 1-3 windows: also the shape of Q12's resident windows (and later Q9, Q14).
export const PickupWindows = v.message(v.pipe(v.array(PickupWindowInput), v.minLength(1), v.maxLength(3)),
                                       'must have 1 to 3 windows');

// One item's category and quantity: also the shape of Q9's fields.
export const CategoryId = v.message(v.pipe(v.string(), v.minLength(1)), 'must be a category id');
export const Quantity = v.message(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(INT_MAX)),
                                  `must be a whole number from 1 to ${INT_MAX}`);

// An uploaded photo (PhotoRef). Not an object, or an unknown key: toFields
// words these itself. Whether the file is usable is checked with ImageKit (6.5).
export const PhotoRef = v.strictObject({
  fileId: v.message(v.pipe(v.string(), v.minLength(1)), 'must be an uploaded file id'),
});

const CreateRequests = v.strictObject({
  items: v.message(v.pipe(v.array(v.strictObject({
    categoryId: CategoryId,
    quantity: Quantity,
    photo: v.optional(PhotoRef),
  })), v.minLength(1)), 'must have at least 1 item'),
  windows: PickupWindows,
  notes: v.optional(v.pipe(v.string('must be text'), fitsFreeTextLimit)),
  termsDocumentId: v.message(v.pipe(v.string(), v.minLength(1)), 'must be the current terms document id'),
});

export type CreateRequestsBody = {
  categoryIds: string[];
  quantities: number[];
  photoFileIds: (string | null)[];     // null: the item has no photo
  dates: string[];                     // 'YYYY-MM-DD', a real calendar date
  hours: number[];
  notes: string | null;                // null: not sent, or blank
  termsDocumentId: string;             // a well-formed UUID
};

export function parseCreateRequestsBody(body: unknown): CreateRequestsBody {
  const { items, windows, notes, termsDocumentId } = parseBody(CreateRequests, body);

  // Contract: a malformed id is answered like an outdated one, before the
  // database would fail to cast it to UUID.
  if (!v.is(Uuid, termsDocumentId)) throw termsOutdated();

  // A repeated categoryId or photo fileId, before any ImageKit call: each item
  // after the first with that value is reported, as req_create_requests words it.
  const fields: Record<string, string> = {};
  items.forEach((item, i) => {
    const firstWithCategory = items.findIndex((other) => other.categoryId === item.categoryId);
    if (firstWithCategory < i) fields[`items[${i}].categoryId`] = 'already selected';

    const fileId = item.photo?.fileId;
    const firstWithFile = items.findIndex((other) => other.photo?.fileId === fileId);
    if (fileId !== undefined && firstWithFile < i) fields[`items[${i}].photo.fileId`] = 'already used';
  });
  if (Object.keys(fields).length > 0) throw validationFailed(fields);

  return {
    categoryIds: items.map((item) => item.categoryId),
    quantities: items.map((item) => item.quantity),
    photoFileIds: items.map((item) => item.photo?.fileId ?? null),
    dates: windows.map((w) => w.date),
    hours: windows.map((w) => w.startHour),
    notes: blankToNull(notes),
    termsDocumentId,
  };
}
