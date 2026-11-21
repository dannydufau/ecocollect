// Q15 body shape checks (RecordDelivery in openapi.yaml), before the database
// call. Whether the facility accepts the category and whether the photo is
// usable is decided later (ImageKit check, then req_record_delivery).
import * as v from 'valibot';
import { parseBody, Uuid } from './body-validation.ts';

const RecordDelivery = v.strictObject({
  facilityId: v.message(v.pipe(v.string(), v.minLength(1)), 'must be a facility id'),
  // Missing, not an object, or an unknown key: toFields words these itself.
  evidencePhoto: v.strictObject({
    fileId: v.message(v.pipe(v.string(), v.minLength(1)), 'must be an uploaded file id'),
  }),
});

export type RecordDeliveryBody = {
  facilityId: string | null;           // null: not a UUID
  fileId: string;
};

export function parseRecordDeliveryBody(body: unknown): RecordDeliveryBody {
  const { facilityId, evidencePhoto } = parseBody(RecordDelivery, body);

  // A facilityId that isn't a UUID can't be cast in the database: it goes in as
  // null and req_record_delivery answers it as an unknown facility, after its
  // state checks.
  return {
    facilityId: v.is(Uuid, facilityId) ? facilityId : null,
    fileId: evidencePhoto.fileId,
  };
}
