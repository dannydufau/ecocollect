import type { Express } from 'express';
import type { PoolClient } from 'pg';
import { getPool } from '../db/pool.ts';
import { HttpError } from '../http/errors.ts';

export type PublicProfile = {
  accountId: string; publicName: string; roles: ('resident' | 'volunteer')[]; memberSince: string;
};

function profileNotFound(): HttpError {
  return new HttpError(404, 'profile_not_found', 'Profile not found.');
}

function validAccountId(accountId: unknown): accountId is string {
  return typeof accountId === 'string' && accountId.length >= 3 && accountId.length <= 50 && !/[^a-z0-9_-]/.test(accountId);
}

export async function loadPublicProfile(client: Pick<PoolClient, 'query'>, accountId: unknown): Promise<PublicProfile> {
  if (!validAccountId(accountId)) throw profileNotFound();
  const { rows } = await client.query(
    `SELECT a.account_id, a.public_name, a.created_at,
       r.account_id IS NOT NULL AS is_resident, v.account_id IS NOT NULL AS is_volunteer
     FROM users.account a
     LEFT JOIN users.resident r ON r.account_id=a.account_id
     LEFT JOIN users.volunteer v ON v.account_id=a.account_id
     WHERE a.account_id=$1 AND a.deactivated_at IS NULL`, [accountId],
  );
  if (!rows[0]) throw profileNotFound();
  const row = rows[0];
  const roles: PublicProfile['roles'] = [];
  if (row.is_resident) roles.push('resident');
  if (row.is_volunteer) roles.push('volunteer');
  if (!roles.length) throw profileNotFound();
  return { accountId: row.account_id, publicName: row.public_name, roles, memberSince: row.created_at.toISOString() };
}

export function register(app: Express, readProfile: (accountId: string) => Promise<PublicProfile> =
  accountId => loadPublicProfile(getPool(), accountId)): void {
  app.get('/api/public/profiles/:accountId', async (req, res) => {
    if (!validAccountId(req.params.accountId)) throw profileNotFound();
    res.json(await readProfile(req.params.accountId));
  });
}
