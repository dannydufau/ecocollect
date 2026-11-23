// Q3 body shape checks (UploadRequest in openapi.yaml), before the database
// call. Whether the caller may upload for this purpose is req_check_upload's job.
import * as v from 'valibot';
import { MAX_PHOTO_BYTES, PHOTO_TYPES, type PhotoPurpose, type PhotoType } from '../imagekit/photos.ts';
import { parseBody, Uuid } from './body-validation.ts';
import { validationFailed } from './errors.ts';

const UploadRequest = v.strictObject({
  purpose: v.picklist(['item_photo', 'delivery_evidence'], 'must be "item_photo" or "delivery_evidence"'),
  requestId: v.optional(v.message(v.string(), 'must be a request id')),
  fileName: v.message(v.pipe(v.string(), v.minLength(1)), 'must be a file name'),
  contentType: v.picklist(PHOTO_TYPES, 'must be image/jpeg, image/png or image/webp'),
  sizeBytes: v.message(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_PHOTO_BYTES)),
    `must be a whole number of bytes, at most ${MAX_PHOTO_BYTES} (10 MB)`),
});

export type UploadBody = {
  purpose: PhotoPurpose;
  requestId: string | null;            // always null for 'item_photo'
  contentType: PhotoType;
};

export function parseUploadBody(body: unknown): UploadBody {
  const { purpose, requestId, contentType } = parseBody(UploadRequest, body);

  // An item photo belongs to no request yet (Q4 creates it): a requestId sent
  // with it is ignored.
  if (purpose === 'item_photo') return { purpose, requestId: null, contentType };

  // Evidence is for one request: its id is required and must be a UUID.
  if (requestId === undefined) {
    throw validationFailed({ requestId: 'is required for delivery_evidence' });
  }
  if (!v.is(Uuid, requestId)) throw validationFailed({ requestId: 'must be a request id' });
  return { purpose, requestId, contentType };
}
