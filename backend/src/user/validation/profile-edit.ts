import { validationFailed } from '../http/errors.ts';
import { validatePreferredPostalCodes, validateProfileAddress } from './account.ts';

export type ProfileEdit = {
  publicName?: string;
  address?: { street: string; postalCode: string; city?: 'Calgary' };
  preferredPostalCodes?: string[];
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateProfileEdit(body: unknown): ProfileEdit {
  if (!isObject(body) || Object.keys(body).length === 0) {
    throw validationFailed({ body: 'Send at least one profile field to edit.' });
  }
  const fields = new Map<string, string>();
  for (const key of Object.keys(body)) {
    if (!['publicName', 'address', 'preferredPostalCodes'].includes(key)) fields.set(key, 'This field is not allowed.');
  }
  if (Object.hasOwn(body, 'publicName')) {
    const name = body.publicName;
    if (typeof name !== 'string' || !name.trim() || [...name].length > 80) {
      fields.set('publicName', 'Enter a name of 1 to 80 characters.');
    }
  }
  if (Object.hasOwn(body, 'address')) validateProfileAddress(body.address, fields);
  if (Object.hasOwn(body, 'preferredPostalCodes')) validatePreferredPostalCodes(body.preferredPostalCodes, fields);
  if (fields.size) throw validationFailed(Object.fromEntries(fields));
  return body as ProfileEdit;
}
