// What the routes need from ImageKit: an upload ticket (contract 6.1-6.3), the
// file check of 6.5 before a photo is attached, and deleting a photo no request
// uses any more (6.7). client.ts asks ImageKit; fake.ts is for tests.
import { randomUUID } from 'node:crypto';

export type PhotoPurpose = 'item_photo' | 'delivery_evidence';

// The photo types and the size limit of 6.1 (also Q3's body rules).
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

// Where the browser uploads (6.3) and how long a ticket lasts (6.2: 10 min).
export const UPLOAD_URL = 'https://upload.imagekit.io/api/v2/files/upload';
export const TICKET_SECONDS = 600;

export type PhotoCheck = {
  fileId: string;
  purpose: PhotoPurpose;
  callerId: string;
  requestId: string | null;            // required for 'delivery_evidence' (its folder holds it)
};

export type TicketRequest = {
  purpose: PhotoPurpose;
  callerId: string;
  requestId: string | null;            // required for 'delivery_evidence'
  contentType: PhotoType;
};

// The upload parameters 6.2 pins. The browser sends each one unchanged (6.3),
// and the token carries the same values, so ImageKit refuses any change.
export type TicketFields = {
  fileName: string;
  folder: string;
  isPrivateFile: true;
  useUniqueFileName: false;
  overwriteFile: false;
  checks: string;
  transformation: string;
};

export type UploadTicket = {
  uploadUrl: string;
  token: string;
  fields: TicketFields;
  expiresAt: Date;
};

export type Photos = {
  // A signed one-time ticket for one upload (6.2). The caller checked who may ask.
  ticket(request: TicketRequest): UploadTicket;
  // The file's ImageKit path when it passes 6.5 (in the folder 6.2 pins for this
  // caller and purpose, private, an allowed type and size), otherwise null.
  verify(check: PhotoCheck): Promise<string | null>;
  // Deletes the file from ImageKit. Throws when ImageKit refuses; the caller logs it.
  remove(fileId: string): Promise<void>;
};

// The folder 6.2 pins for this caller and purpose, under the root folder
// (IMAGEKIT_ROOT_FOLDER). Ends with '/', so a path that starts with it is inside.
export function photoFolder(
  rootFolder: string, purpose: PhotoPurpose, callerId: string, requestId: string | null,
): string {
  if (purpose === 'item_photo') return `${rootFolder}/item-photos/${callerId}/`;
  if (requestId === null) throw new Error('photoFolder: evidence needs a request id');
  return `${rootFolder}/delivery-evidence/${callerId}/${requestId}/`;
}

const EXTENSIONS: Record<PhotoType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// The pinned upload parameters of 6.2 for one ticket: a new '<uuid>.<ext>' name,
// the caller's folder, private, no renaming or overwriting, the size and type
// limits as an ImageKit check, and metadata stripped before the file is stored.
export function ticketFields(rootFolder: string, request: TicketRequest): TicketFields {
  const { purpose, callerId, requestId, contentType } = request;
  const types = PHOTO_TYPES.map((type) => `"${type}"`).join(',');
  return {
    fileName: `${randomUUID()}.${EXTENSIONS[contentType]}`,
    folder: photoFolder(rootFolder, purpose, callerId, requestId),
    isPrivateFile: true,
    useUniqueFileName: false,
    overwriteFile: false,
    checks: `"file.size" <= ${MAX_PHOTO_BYTES} AND "file.mime" IN [${types}]`,
    transformation: JSON.stringify({ pre: 'md-false' }),
  };
}

// The default for tests that don't pass an imagekit: no ticket can be signed,
// every photo is refused, and there is no file to delete.
export const noPhotos: Photos = {
  ticket: () => { throw new Error('ImageKit is not configured'); },
  verify: async () => null,
  remove: async () => {},
};
