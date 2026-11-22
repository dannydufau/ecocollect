import type { Express } from 'express';
import type { Pool } from 'pg';
import firebase from '../auth/firebase.cjs';
import { hasOpenOrAssignedRequest } from '../db/address-lock.ts';
import { enqueueEvent } from '../db/outbox.ts';
import { getPool } from '../db/pool.ts';
import { loadProfile } from '../db/profile.ts';
import { HttpError } from '../http/errors.ts';
import { validateProfileEdit } from '../validation/profile-edit.ts';

const accountLockPrefix = 'account:';

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
      await client.query('BEGIN');
      const account = await client.query(
        'SELECT 1 FROM users.account WHERE account_id = $1 AND deactivated_at IS NULL FOR UPDATE', [accountId],
      );
      if (!account.rowCount) throw new HttpError(404, 'profile_not_found', 'Profile not found.');
      const { rows: [membership] } = await client.query(
        `SELECT EXISTS (SELECT FROM users.resident WHERE account_id = $1) AS resident,
                EXISTS (SELECT FROM users.volunteer WHERE account_id = $1) AS volunteer`, [accountId],
      );
      const { publicName, address, preferredPostalCodes } = input;
      if (address && !membership.resident) {
        throw new HttpError(403, 'role_required', 'The resident role is required to change your address.');
      }
      if (preferredPostalCodes && !membership.volunteer) {
        throw new HttpError(403, 'role_required', 'The volunteer role is required to change preferred postal codes.');
      }
      if (address) {
        // Request creation takes the same lock before copying the resident address.
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1 || $2))', [accountLockPrefix, accountId]);
        if (await hasOpenOrAssignedRequest(client, accountId)) {
          throw new HttpError(409, 'address_locked', 'Your address is locked while you have an Open or Assigned request.');
        }
      }
      if (publicName !== undefined) {
        await client.query('UPDATE users.account SET public_name = $2 WHERE account_id = $1', [accountId, publicName]);
      }
      if (address) {
        await client.query(
          'UPDATE users.resident SET street = $2, postal_code = $3 WHERE account_id = $1',
          [accountId, address.street, address.postalCode],
        );
      }
      if (preferredPostalCodes) {
        await client.query('DELETE FROM users.volunteer_preferred_postal_code WHERE account_id = $1', [accountId]);
        await client.query(
          `INSERT INTO users.volunteer_preferred_postal_code (account_id, postal_code)
           SELECT $1, code FROM unnest($2::text[]) AS code`, [accountId, preferredPostalCodes],
        );
      }
      const profile = await loadProfile(client, auth(), accountId);
      await enqueueEvent(client, {
        type: 'ProfileUpdated', routingKey: 'user.profile.updated', traceId: req.get('X-Request-Id'),
        data: { accountId, changed: Object.keys(input), publicName: profile.publicName, roles: profile.roles },
      });
      await client.query('COMMIT');
      res.json(profile);
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
