import type { Express } from 'express';
import type { Pool, PoolClient } from 'pg';
import firebase from '../auth/firebase.cjs';
import { hasActiveWork } from '../db/active-work.ts';
import { enqueueEvent } from '../db/outbox.ts';
import { getPool } from '../db/pool.ts';
import { disableUser, enableUser } from '../firebase/accounts.ts';
import { HttpError } from '../http/errors.ts';

type Auth = Parameters<typeof disableUser>[0];

async function lockActiveAccount(client: PoolClient, accountId: string): Promise<boolean> {
  const result = await client.query(
    'SELECT 1 FROM users.account WHERE account_id = $1 AND deactivated_at IS NULL FOR NO KEY UPDATE', [accountId],
  );
  return Boolean(result.rowCount);
}

async function requireNoActiveWork(client: Pick<PoolClient, 'query'>, accountId: string): Promise<void> {
  if (await hasActiveWork(client, accountId)) {
    throw new HttpError(409, 'active_work', 'Finish your active pickup requests and assignments before deactivating.');
  }
}

export function register(app: Express, {
  database = getPool, auth = firebase.getFirebaseAuth,
}: { database?: () => Pick<Pool, 'query' | 'connect'>; auth?: () => Auth } = {}): void {
  app.delete('/api/profile', async (req, res) => {
    const accountId = req.get('X-User-Id');
    if (!accountId) throw new HttpError(401, 'unauthenticated', 'Sign in to deactivate your account.');
    const pool = database();
    await requireNoActiveWork(pool, accountId);
    const client = await pool.connect();
    let discardClient = false;
    let firebaseAuth: Auth | undefined;
    let committing = false;
    try {
      await client.query('BEGIN');
      // Serialize deactivations while allowing Request's terms-acceptance foreign key checks.
      if (!await lockActiveAccount(client, accountId)) {
        throw new HttpError(404, 'profile_not_found', 'Profile not found.');
      }
      firebaseAuth = auth();
      await disableUser(firebaseAuth, accountId);
      // Q4 and Q11 take the same lock before checking whether the account is active.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('account:' || $1))", [accountId]);
      await requireNoActiveWork(client, accountId);
      const { rows: [{ deactivated_at }] } = await client.query(
        'UPDATE users.account SET deactivated_at = clock_timestamp() WHERE account_id = $1 RETURNING deactivated_at', [accountId],
      );
      await enqueueEvent(client, {
        type: 'AccountDeactivated', routingKey: 'user.account.deactivated', traceId: req.get('X-Request-Id'),
        data: { accountId, deactivatedAt: deactivated_at.toISOString() },
      });
      committing = true;
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
        if (firebaseAuth && !committing) {
          await client.query('BEGIN');
          // Another attempt may have succeeded after the rollback released the row.
          if (await lockActiveAccount(client, accountId)) await enableUser(firebaseAuth, accountId);
          await client.query('COMMIT');
        }
      } catch (recoveryError) {
        discardClient = true;
        throw new AggregateError([error, recoveryError], 'Could not recover the account after failed deactivation.');
      }
      if (committing) {
        console.error('Could not confirm account deactivation:', error);
        throw new HttpError(500, 'internal_error', 'We could not confirm account deactivation.');
      }
      throw error;
    } finally {
      client.release(discardClient);
    }
    res.clearCookie('session', { httpOnly: true, secure: true, sameSite: 'lax' }).sendStatus(204);
  });
}
