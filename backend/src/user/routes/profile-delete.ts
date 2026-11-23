import type { Express } from 'express';
import type { Pool, PoolClient } from 'pg';
import firebase from '../auth/firebase.cjs';
import authRouter from '../auth/router.cjs';
import { hasActiveWork } from '../db/active-work.ts';
import { enqueueEvent } from '../db/outbox.ts';
import { getPool } from '../db/pool.ts';
import { enableUser, type disableUser } from '../firebase/accounts.ts';
import { HttpError } from '../http/errors.ts';

type Auth = Parameters<typeof disableUser>[0];
const deactivationLock = "hashtext('user:deactivation'), hashtext($1)";

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
    let sessionLocked = false;
    let inTransaction = false;
    let firebaseAuth: Auth | undefined;
    let committing = false;
    try {
      // Serialize deactivation attempts without holding a row lock during the Firebase call.
      await client.query(`SELECT pg_advisory_lock(${deactivationLock})`, [accountId]);
      sessionLocked = true;
      const account = await client.query(
        'SELECT 1 FROM users.account WHERE account_id = $1 AND deactivated_at IS NULL', [accountId],
      );
      if (!account.rowCount) {
        throw new HttpError(404, 'profile_not_found', 'Profile not found.');
      }
      firebaseAuth = auth();
      await firebaseAuth.updateUser(accountId, { disabled: true });
      await client.query('BEGIN');
      inTransaction = true;
      // Q4 and Q11 take the same lock before checking whether the account is active.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('account:' || $1))", [accountId]);
      if (!await lockActiveAccount(client, accountId)) {
        throw new HttpError(404, 'profile_not_found', 'Profile not found.');
      }
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
      inTransaction = false;
    } catch (error) {
      try {
        if (inTransaction) await client.query('ROLLBACK');
      } catch (rollbackError) {
        discardClient = true;
        console.error('Could not roll back account deactivation:', rollbackError);
      }
      try {
        if (firebaseAuth && !committing) {
          await enableUser(firebaseAuth, accountId);
        }
      } catch (recoveryError) {
        discardClient = true;
        console.error('Could not re-enable Firebase after failed account deactivation:', { accountId, traceId: req.get('X-Request-Id') }, recoveryError);
        throw new AggregateError([error, recoveryError], 'Could not recover the account after failed deactivation.');
      }
      if (committing) {
        console.error('Could not confirm account deactivation:', { accountId, traceId: req.get('X-Request-Id') }, error);
        throw new HttpError(500, 'internal_error', 'We could not confirm account deactivation.');
      }
      throw error;
    } finally {
      if (sessionLocked && !discardClient) {
        try {
          const { rows: [{ unlocked }] } = await client.query(
            `SELECT pg_advisory_unlock(${deactivationLock}) AS unlocked`, [accountId],
          );
          discardClient = !unlocked;
        } catch (unlockError) {
          discardClient = true;
          console.error('Could not release the deactivation lock:', unlockError);
        }
      }
      client.release(discardClient);
    }
    try {
      await firebaseAuth?.revokeRefreshTokens(accountId);
    } catch (error) {
      console.error('Could not revoke tokens for the deactivated account:', error);
    }
    res.clearCookie(authRouter.COOKIE_NAME, authRouter.COOKIE_OPTIONS).sendStatus(204);
  });
}
