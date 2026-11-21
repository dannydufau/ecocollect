// The real ImageKit behind the Photos interface: signs upload tickets (contract
// 6.2), checks uploaded files (6.5), signs photo URLs (6.6) and deletes unused
// ones (6.7) with the SDK.
import { createHmac } from 'node:crypto';
import ImageKit, { BadRequestError, NotFoundError } from '@imagekit/nodejs';
import {
  MAX_PHOTO_BYTES, PHOTO_TYPES, PHOTO_URL_SECONDS, TICKET_SECONDS, UPLOAD_URL,
  photoFolder, ticketFields, type Photos, type TicketFields,
} from './photos.ts';

export type ImageKitConfig = {
  privateKey: string;    // IMAGEKIT_PRIVATE_KEY: signs tokens, calls the API
  publicKey: string;     // IMAGEKIT_PUBLIC_KEY: the token's kid
  urlEndpoint: string;   // IMAGEKIT_URL_ENDPOINT: for signed photo URLs (6.6)
  rootFolder: string;    // IMAGEKIT_ROOT_FOLDER: e.g. '/ecocollect'
};

const API_TIMEOUT_MS = 10_000;   // a route waits for ImageKit, so don't wait the SDK's default minute
const API_RETRIES = 1;

export function imagekitPhotos(config: ImageKitConfig): Photos {
  const { privateKey, publicKey, urlEndpoint, rootFolder } = config;
  if (!rootFolder.startsWith('/') || rootFolder.endsWith('/')) {
    throw new Error(`IMAGEKIT_ROOT_FOLDER must start with '/' and not end with '/': ${rootFolder}`);
  }
  const client = new ImageKit({ privateKey, timeout: API_TIMEOUT_MS, maxRetries: API_RETRIES });

  return {
    ticket(request) {
      const fields = ticketFields(rootFolder, request);
      const issuedAt = Math.floor(Date.now() / 1000);
      const expiresAt = issuedAt + TICKET_SECONDS;
      return {
        uploadUrl: UPLOAD_URL,
        token: uploadToken(fields, issuedAt, expiresAt, publicKey, privateKey),
        fields,
        expiresAt: new Date(expiresAt * 1000),
      };
    },

    async verify({ fileId, purpose, callerId, requestId }) {
      // Fetch the file's details; an unknown or malformed fileId is a failed check.
      let file;
      try {
        file = await client.files.get(fileId);
      } catch (err) {
        if (err instanceof NotFoundError || err instanceof BadRequestError) return null;
        throw err;
      }

      const folder = photoFolder(rootFolder, purpose, callerId, requestId);
      const inFolder = typeof file.filePath === 'string' && file.filePath.startsWith(folder);
      const isPrivate = file.isPrivateFile === true;
      const allowedType = (PHOTO_TYPES as readonly unknown[]).includes(file.mime);
      const allowedSize = typeof file.size === 'number' && file.size <= MAX_PHOTO_BYTES;

      if (!inFolder || !isPrivate || !allowedType || !allowedSize) return null;
      return file.filePath as string;
    },

    // Builds the URL locally (no API call); the SDK signs it with the private key.
    sign(path) {
      return client.helper.buildSrc({ urlEndpoint, src: path, signed: true, expiresIn: PHOTO_URL_SECONDS });
    },

    async remove(fileId) {
      await client.files.delete(fileId);
    },
  };
}

// The V2 upload token (ImageKit's "JSON Web Token for secure client-side file
// upload"): an HS256 JWT signed with the private key, kid = the public key.
// The payload holds every upload parameter as a string, plus iat and exp as
// integers (exp at most 3600 s after iat).
function uploadToken(
  fields: TicketFields, issuedAt: number, expiresAt: number, publicKey: string, privateKey: string,
): string {
  const header = { alg: 'HS256', typ: 'JWT', kid: publicKey };
  const payload: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(fields)) payload[name] = String(value);
  payload.iat = issuedAt;
  payload.exp = expiresAt;

  const unsigned = `${base64url(header)}.${base64url(payload)}`;
  const signature = createHmac('sha256', privateKey).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
