import { validationFailed } from '../http/errors.ts';
import { isCalgaryPostalCode } from './account.ts';

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
  if (Object.hasOwn(body, 'address')) {
    if (!isObject(body.address)) fields.set('address', 'Enter a street and postal code.');
    else {
      const { street, postalCode, city } = body.address;
      for (const key of Object.keys(body.address)) {
        if (!['street', 'postalCode', 'city'].includes(key)) fields.set(`address.${key}`, 'This field is not allowed.');
      }
      if (typeof street !== 'string' || !street.trim() || [...street].length > 255) {
        fields.set('address.street', 'Enter a street of 1 to 255 characters.');
      }
      if (!isCalgaryPostalCode(postalCode)) fields.set('address.postalCode', 'Enter a six-character Calgary postal code.');
      if (Object.hasOwn(body.address, 'city') && city !== 'Calgary') fields.set('address.city', 'The city must be Calgary.');
    }
  }
  if (Object.hasOwn(body, 'preferredPostalCodes')) {
    const codes = body.preferredPostalCodes;
    if (!Array.isArray(codes)) fields.set('preferredPostalCodes', 'Send a list of postal codes.');
    else {
      if (codes.length > 3) fields.set('preferredPostalCodes', 'Choose at most 3 postal codes.');
      const seen = new Set<string>();
      for (const [index, code] of codes.entries()) {
        const key = `preferredPostalCodes[${index}]`;
        if (!isCalgaryPostalCode(code)) fields.set(key, 'Enter a six-character Calgary postal code.');
        else if (seen.has(code)) fields.set(key, 'This postal code is already selected.');
        else seen.add(code);
      }
    }
  }
  if (fields.size) throw validationFailed(Object.fromEntries(fields));
  return body as ProfileEdit;
}
