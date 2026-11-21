// A stand-in for ImageKit in tests: every file passes, with the path the real
// upload would have had (contract 6.2's folders, under the default root folder).
import type { Photos } from './photos.ts';

const ROOT_FOLDER = '/ecocollect';

export const fakePhotos: Photos = {
  verify: async ({ fileId, purpose, callerId, requestId }) =>
    purpose === 'delivery_evidence'
      ? `${ROOT_FOLDER}/delivery-evidence/${callerId}/${requestId}/${fileId}.jpg`
      : `${ROOT_FOLDER}/item-photos/${callerId}/${fileId}.jpg`,
};
