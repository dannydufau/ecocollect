import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import type { Pool } from 'pg';
import firebase from '../auth/firebase.cjs';
import { enqueueEvent } from '../db/outbox.ts';
import { getPool } from '../db/pool.ts';
import { getCurrentTerms } from '../db/terms.ts';
import { setRoles } from '../firebase/accounts.ts';
import { HttpError, validationFailed } from '../http/errors.ts';
import { isCalgaryPostalCode } from '../validation/account.ts';

type Role = Parameters<typeof setRoles>[2][number];
type Auth = Parameters<typeof setRoles>[0];
type RoleActivation = {
  role: Role;
  termsDocumentId: string;
  address?: { street: string; postalCode: string };
  preferredPostalCodes?: string[];
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function validateActivation(body: unknown): RoleActivation {
  if (!isObject(body)) throw validationFailed({ body: 'Send a role activation object.' });
  const fields = new Map<string, string>();
  for (const key of Object.keys(body)) {
    if (!['role', 'termsDocumentId', 'address', 'preferredPostalCodes'].includes(key)) {
      fields.set(key, 'This field is not allowed.');
    }
  }
  if (body.role !== 'resident' && body.role !== 'volunteer') fields.set('role', 'Choose resident or volunteer.');
  if (typeof body.termsDocumentId !== 'string' || !body.termsDocumentId) {
    fields.set('termsDocumentId', 'A terms document ID is required.');
  }
  if (Object.hasOwn(body, 'address') || body.role === 'resident') {
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
  return body as RoleActivation;
}

async function activateRole(pool: Pick<Pool, 'connect'>, auth: () => Auth, accountId: string, input: RoleActivation, traceId?: string): Promise<Role[]> {
  const client = await pool.connect();
  let discardClient = false;
  let committing = false;
  try {
    await client.query('BEGIN');
    const { rows: [account] } = await client.query(
      'SELECT public_name FROM users.account WHERE account_id = $1 AND deactivated_at IS NULL FOR UPDATE',
      [accountId],
    );
    if (!account) throw new HttpError(404, 'profile_not_found', 'Profile not found.');
    // Read memberships after acquiring the account lock so concurrent activations see the committed role.
    const { rows: [membership] } = await client.query(
      `SELECT EXISTS (SELECT FROM users.resident WHERE account_id = $1) AS resident,
              EXISTS (SELECT FROM users.volunteer WHERE account_id = $1) AS volunteer`, [accountId],
    );
    if (membership[input.role]) throw new HttpError(409, 'role_already_active', 'This role is already active.');
    const oldRole = input.role === 'resident' ? 'volunteer' : 'resident';
    if (!membership[oldRole]) throw new HttpError(500, 'internal_error', 'The profile is unavailable. Try again later.');
    const roles: Role[] = [oldRole, input.role];
    const { termsDocumentId } = await getCurrentTerms(client);
    if (termsDocumentId !== input.termsDocumentId.toLowerCase()) {
      throw new HttpError(409, 'terms_outdated', 'Please review and accept the current terms.');
    }

    if (input.role === 'resident') {
      const address = input.address!;
      await client.query(
        'INSERT INTO users.resident (account_id, street, postal_code) VALUES ($1, $2, $3)',
        [accountId, address.street, address.postalCode],
      );
    } else {
      await client.query('INSERT INTO users.volunteer (account_id) VALUES ($1)', [accountId]);
      for (const code of input.preferredPostalCodes ?? []) {
        await client.query(
          'INSERT INTO users.volunteer_preferred_postal_code (account_id, postal_code) VALUES ($1, $2)',
          [accountId, code],
        );
      }
    }
    await client.query(
      `INSERT INTO users.terms_acceptance (terms_acceptance_id, terms_document_id, account_id, accepted_at, type)
       VALUES ($1, $2, $3, now(), $4)`,
      [randomUUID(), termsDocumentId, accountId, input.role === 'resident'
        ? 'AT_RESIDENT_REGISTRATION_OR_ACTIVATION' : 'AT_VOLUNTEER_REGISTRATION_OR_ACTIVATION'],
    );
    await enqueueEvent(client, {
      type: 'ProfileUpdated', routingKey: 'user.profile.updated', traceId,
      data: { accountId, changed: ['roles'], publicName: account.public_name, roles },
    });
    // Keep the event invisible to the publisher and the acceptance rollbackable until Firebase confirms.
    await setRoles(auth(), accountId, roles);
    committing = true;
    await client.query('COMMIT');
    return roles;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      discardClient = true;
      console.error('Could not roll back role activation:', rollbackError);
    }
    if (committing) {
      console.error('Could not confirm the role activation commit:', error);
      throw new HttpError(500, 'internal_error', 'We could not confirm role activation. Reload your profile before trying again.');
    }
    throw error;
  } finally {
    client.release(discardClient);
  }
}

export function register(app: Express, {
  database = getPool, auth = firebase.getFirebaseAuth,
}: { database?: () => Pick<Pool, 'connect'>; auth?: () => Auth } = {}): void {
  app.post('/api/profile/roles', async (req, res) => {
    const accountId = req.get('X-User-Id');
    if (!accountId) throw new HttpError(401, 'unauthenticated', 'Sign in to activate a role.');
    const input = validateActivation(req.body);
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.termsDocumentId)) {
      throw new HttpError(409, 'terms_outdated', 'Please review and accept the current terms.');
    }
    const roles = await activateRole(database(), auth, accountId, input, req.get('X-Request-Id'));
    res.json({ roles });
  });
}
