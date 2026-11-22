import type { Express } from 'express';
import type { Pool } from 'pg';
import firebase from '../auth/firebase.cjs';
import { hasOpenOrAssignedRequest } from '../db/address-lock.ts';
import { enqueueEvent } from '../db/outbox.ts';
import { getPool } from '../db/pool.ts';
import { loadProfile, type Profile } from '../db/profile.ts';
import { HttpError } from '../http/errors.ts';
import { validateProfileEdit, type ProfileEdit } from '../validation/profile-edit.ts';

const accountLockPrefix = 'account:';

function sameAddress(current: Pick<NonNullable<Profile['address']>, 'street' | 'postalCode'> | null, proposed: NonNullable<ProfileEdit['address']>): boolean {
  return current?.street === proposed.street && current.postalCode === proposed.postalCode;
}

export function register(app: Express, {
  database = getPool, auth = firebase.getFirebaseAuth,
}: { database?: () => Pick<Pool, 'connect'>; auth?: () => Parameters<typeof loadProfile>[1] } = {}): void {
  app.patch('/api/profile', async (req, res) => {
    const accountId = req.get('X-User-Id');
    if (!accountId) throw new HttpError(401, 'unauthenticated', 'Sign in to edit your profile.');
    const input = validateProfileEdit(req.body);
    const client = await database().connect();
    let discardClient = false;
    try {
      const before = await client.query(
        `SELECT r.street, r.postal_code AS "postalCode" FROM users.account a
         LEFT JOIN users.resident r USING (account_id)
         WHERE a.account_id = $1 AND a.deactivated_at IS NULL`, [accountId],
      );
      if (!before.rowCount) throw new HttpError(404, 'profile_not_found', 'Profile not found.');
      const firebaseUser = await auth().getUser(accountId);
      const cachedAuth = { getUser: async () => firebaseUser };
      const { publicName, address, preferredPostalCodes } = input;
      let needsAddressLock = Boolean(address && before.rows[0].street !== null && !sameAddress(before.rows[0], address));
      for (;;) {
        await client.query('BEGIN');
        if (needsAddressLock) {
          await client.query('SELECT pg_advisory_xact_lock(hashtext($1 || $2))', [accountLockPrefix, accountId]);
        }
        const account = await client.query(
          'SELECT 1 FROM users.account WHERE account_id = $1 AND deactivated_at IS NULL FOR NO KEY UPDATE', [accountId],
        );
        if (!account.rowCount) throw new HttpError(404, 'profile_not_found', 'Profile not found.');
        const current = await loadProfile(client, cachedAuth, accountId);
        if (address && !current.roles.includes('resident')) {
          throw new HttpError(403, 'role_required', 'The resident role is required to change your address.');
        }
        if (preferredPostalCodes && !current.roles.includes('volunteer')) {
          throw new HttpError(403, 'role_required', 'The volunteer role is required to change preferred postal codes.');
        }
        const changed: string[] = [];
        if (address && !sameAddress(current.address, address) && !needsAddressLock) {
          // The address changed since the first read. Retry with the advisory lock first.
          await client.query('ROLLBACK');
          needsAddressLock = true;
          continue;
        }
        if (publicName !== undefined && publicName !== current.publicName) {
          await client.query('UPDATE users.account SET public_name = $2 WHERE account_id = $1', [accountId, publicName]);
          changed.push('publicName');
        }
        if (address && !sameAddress(current.address, address)) {
          if (await hasOpenOrAssignedRequest(client, accountId)) {
            throw new HttpError(409, 'address_locked', 'Your address is locked while you have an Open or Assigned request.');
          }
          await client.query(
            'UPDATE users.resident SET street = $2, postal_code = $3 WHERE account_id = $1',
            [accountId, address.street, address.postalCode],
          );
          changed.push('address');
        }
        if (preferredPostalCodes && (preferredPostalCodes.length !== current.preferredPostalCodes.length ||
            preferredPostalCodes.some(code => !current.preferredPostalCodes.includes(code)))) {
          await client.query('DELETE FROM users.volunteer_preferred_postal_code WHERE account_id = $1', [accountId]);
          await client.query(
            `INSERT INTO users.volunteer_preferred_postal_code (account_id, postal_code)
             SELECT $1, code FROM unnest($2::text[]) AS code`, [accountId, preferredPostalCodes],
          );
          changed.push('preferredPostalCodes');
        }
        const profile = changed.length ? await loadProfile(client, cachedAuth, accountId) : current;
        if (changed.length) {
          await enqueueEvent(client, {
            type: 'ProfileUpdated', routingKey: 'user.profile.updated', traceId: req.get('X-Request-Id'),
            data: { accountId, changed, publicName: profile.publicName, roles: profile.roles },
          });
        }
        await client.query('COMMIT');
        res.json(profile);
        break;
      }
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        discardClient = true;
        throw new AggregateError([error, rollbackError], 'Could not roll back the profile edit.');
      }
      throw error;
    } finally {
      client.release(discardClient);
    }
  });
}
