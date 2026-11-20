import type { PoolClient } from 'pg';
import { HttpError } from '../http/errors.ts';

type ProfileAuth = { getUser(uid: string): Promise<{ email?: string }> };
export type Profile = {
  accountId: string; email: string; firstName: string; lastName: string; publicName: string;
  dateOfBirth: string; roles: ('resident' | 'volunteer')[];
  address: { street: string; city: 'Calgary'; postalCode: string } | null;
  preferredPostalCodes: string[]; createdAt: string;
};

export async function loadProfile(client: Pick<PoolClient, 'query'>, auth: ProfileAuth, accountId: string): Promise<Profile> {
  const { rows } = await client.query(
    `SELECT a.account_id, a.first_name, a.last_name, a.public_name,
       to_char(a.date_of_birth, 'YYYY-MM-DD') AS date_of_birth, a.created_at,
       r.account_id IS NOT NULL AS is_resident, v.account_id IS NOT NULL AS is_volunteer,
       r.street, r.postal_code,
       ARRAY(SELECT p.postal_code::text FROM users.volunteer_preferred_postal_code p
             WHERE p.account_id=a.account_id ORDER BY p.postal_code) AS preferred_postal_codes
     FROM users.account a
     LEFT JOIN users.resident r ON r.account_id=a.account_id
     LEFT JOIN users.volunteer v ON v.account_id=a.account_id
     WHERE a.account_id=$1 AND a.deactivated_at IS NULL`, [accountId],
  );
  if (!rows[0]) throw new HttpError(404, 'profile_not_found', 'Profile not found.');
  const row = rows[0];
  const firebaseUser = await auth.getUser(accountId);
  const roles: Profile['roles'] = [];
  if (row.is_resident) roles.push('resident');
  if (row.is_volunteer) roles.push('volunteer');
  if (!firebaseUser.email || roles.length === 0) {
    throw new HttpError(500, 'internal_error', 'The profile is unavailable. Try again later.');
  }
  return {
    accountId: row.account_id, email: firebaseUser.email,
    firstName: row.first_name, lastName: row.last_name, publicName: row.public_name,
    dateOfBirth: row.date_of_birth, roles,
    address: row.is_resident ? { street: row.street, city: 'Calgary', postalCode: row.postal_code } : null,
    preferredPostalCodes: row.is_volunteer ? row.preferred_postal_codes : [],
    createdAt: row.created_at.toISOString(),
  };
}
