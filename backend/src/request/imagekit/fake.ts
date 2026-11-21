// A stand-in for ImageKit in tests: tickets carry the real pinned fields with a
// fake token, and every file passes, with the path the real upload would have had
// (contract 6.2's folders, under the default root folder).
import { photoFolder, ticketFields, TICKET_SECONDS, UPLOAD_URL, type Photos } from './photos.ts';

const ROOT_FOLDER = '/ecocollect';

export const fakePhotos: Photos = {
  ticket: (request) => ({
    uploadUrl: UPLOAD_URL,
    token: 'fake-token',
    fields: ticketFields(ROOT_FOLDER, request),
    expiresAt: new Date(Date.now() + TICKET_SECONDS * 1000),
  }),
  verify: async ({ fileId, purpose, callerId, requestId }) =>
    `${photoFolder(ROOT_FOLDER, purpose, callerId, requestId)}${fileId}.jpg`,
  remove: async () => {},              // a test that checks deletions passes its own
};
