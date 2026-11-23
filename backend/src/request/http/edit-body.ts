// Q9 body shape checks (EditRequest in openapi.yaml), before the database call.
// Every field is optional, but at least one must be sent. Rules that need the
// database (category exists, windows in the future, within 30 days of creation,
// photo usable) are req_edit's job.
import * as v from 'valibot';
import { parseBody } from './body-validation.ts';
import { CategoryId, notesFit, PickupWindows, Quantity } from './create-requests-body.ts';

const EditRequest = v.pipe(
  v.strictObject({
    categoryId: v.optional(CategoryId),
    quantity: v.optional(Quantity),
    notes: v.optional(v.nullable(v.pipe(v.string('must be text or null'), notesFit))),
    windows: v.optional(PickupWindows),
    // null removes the photo. Not an object, or an unknown key: toFields words these itself.
    photo: v.optional(v.nullable(v.strictObject({
      fileId: v.message(v.pipe(v.string(), v.minLength(1)), 'must be an uploaded file id'),
    }))),
  }),
  v.check((body) => Object.keys(body).length > 0, 'must have at least one field'),
);

export type EditField = 'categoryId' | 'quantity' | 'notes' | 'windows' | 'photo';

export type EditBody = {
  sent: EditField[];                   // the fields present in the body
  categoryId: string | null;           // each value: null when not sent
  quantity: number | null;
  notes: string | null;                // also null when sent as null (removes the notes)
  dates: string[] | null;              // 'YYYY-MM-DD'
  hours: number[] | null;              // paired with dates
  fileId: string | null;               // also null when photo is sent as null (removes the photo)
};

export function parseEditBody(body: unknown): EditBody {
  const parsed = parseBody(EditRequest, body);

  // strictObject has refused unknown keys, so every key here is an EditField.
  // A key sent as null (notes, photo) is still present.
  return {
    sent: Object.keys(parsed) as EditField[],
    categoryId: parsed.categoryId ?? null,
    quantity: parsed.quantity ?? null,
    notes: parsed.notes ?? null,
    dates: parsed.windows?.map((w) => w.date) ?? null,
    hours: parsed.windows?.map((w) => w.startHour) ?? null,
    fileId: parsed.photo?.fileId ?? null,
  };
}
