import { randomInt, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import type { Express, Request } from 'express';
import type { Pool } from 'pg';
import firebase from '../auth/firebase.cjs';
import { getPool } from '../db/pool.ts';
import { getCurrentTerms } from '../db/terms.ts';
import { setRoles } from '../firebase/accounts.ts';
import { HttpError } from '../http/errors.ts';

const roles = ['resident', 'volunteer'] as const;
// Seed Open demo requests in these postal codes so the volunteer list has matches (contract §17.4).
const postalCodes = ['T2P1J9', 'T3A0B1', 'T2Y3K5', 'T2N1N4', 'T3K2L7'];
const windowMs = 60_000;
const sessionsPerWindow = 5;

type Auth = Parameters<typeof setRoles>[0] & {
  createUser(input: { uid: string; email: string; displayName: string }): Promise<unknown>;
  createCustomToken(uid: string): Promise<string>;
  deleteUser(uid: string): Promise<void>;
};

function normalizeIp(ip: string): string {
  return /^::ffff:\d/i.test(ip) ? ip.slice(7) : ip;
}

function clientIp(req: Request, proxyIp?: string): string {
  const peer = normalizeIp(req.socket.remoteAddress ?? '');
  if (peer === proxyIp) {
    const forwarded = req.get('X-Forwarded-For')?.split(',').at(-1)?.trim();
    if (forwarded && isIP(forwarded)) return normalizeIp(forwarded);
  }
  return peer;
}

async function saveAccount(pool: Pick<Pool, 'connect'>, auth: Auth, accountId: string, postalCode: string): Promise<void> {
  let committing = false;
  try {
    const client = await pool.connect();
    let discardClient = false;
    try {
      await client.query('BEGIN');
      const { termsDocumentId } = await getCurrentTerms(client);
      await client.query(
        `INSERT INTO users.account (account_id, first_name, last_name, public_name, date_of_birth, created_at)
         VALUES ($1, 'Demo', 'Visitor', 'Demo Visitor', DATE '1990-01-01', now())`, [accountId],
      );
      await client.query(
        "INSERT INTO users.resident (account_id, street, postal_code) VALUES ($1, '100 Demo Example SW', $2)",
        [accountId, postalCode],
      );
      await client.query('INSERT INTO users.volunteer (account_id) VALUES ($1)', [accountId]);
      await client.query(
        'INSERT INTO users.volunteer_preferred_postal_code (account_id, postal_code) VALUES ($1, $2)',
        [accountId, postalCode],
      );
      await client.query(
        `INSERT INTO users.terms_acceptance (terms_acceptance_id, terms_document_id, account_id, accepted_at, type)
         VALUES ($1, $3, $4, now(), 'AT_RESIDENT_REGISTRATION_OR_ACTIVATION'),
                ($2, $3, $4, now(), 'AT_VOLUNTEER_REGISTRATION_OR_ACTIVATION')`,
        [randomUUID(), randomUUID(), termsDocumentId, accountId],
      );
      committing = true;
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        discardClient = true;
        throw new AggregateError([error, rollbackError], 'Could not roll back the demo account.');
      }
      throw error;
    } finally {
      client.release(discardClient);
    }
  } catch (error) {
    if (committing) {
      console.error('Could not confirm the demo account commit:', error);
      throw new HttpError(500, 'internal_error', 'Could not start a demo session. Try again later.');
    }
    await removeAccount(auth, accountId, error);
  }
}

async function removeAccount(auth: Auth, accountId: string, error: unknown): Promise<never> {
  try {
    await auth.deleteUser(accountId);
  } catch (cleanupError) {
    throw new AggregateError([error, cleanupError], 'Could not create or remove the demo Firebase account.');
  }
  throw error;
}

export function register(app: Express, {
  enabled = process.env.DEMO_MODE === 'true',
  database = getPool,
  auth = firebase.getFirebaseAuth,
  now = () => performance.now(),
  proxyAddress = process.env.DEMO_PROXY_IP,
}: {
  enabled?: boolean; database?: () => Pick<Pool, 'connect'>; auth?: () => Auth; now?: () => number; proxyAddress?: string;
} = {}): void {
  if (!enabled) return;
  if (proxyAddress && !isIP(proxyAddress)) throw new Error('DEMO_PROXY_IP must be a single IP address.');
  const proxyIp = proxyAddress ? normalizeIp(proxyAddress) : undefined;
  const attempts = new Map<string, { deadline: number; count: number }>();

  app.post('/api/demo/session', async (req, res) => {
    const time = now();
    for (const [ip, entry] of attempts) {
      if (entry.deadline > time) break;
      attempts.delete(ip);
    }
    const ip = clientIp(req, proxyIp);
    const entry = attempts.get(ip) ?? { deadline: time + windowMs, count: 0 };
    if (entry.count >= sessionsPerWindow) {
      res.set('Retry-After', String(Math.ceil((entry.deadline - time) / 1000)));
      throw new HttpError(429, 'rate_limited', 'Too many demo sessions from this address. Try again later.');
    }
    entry.count++;
    attempts.set(ip, entry);

    const pool = database();
    const firebaseAuth = auth();
    const accountId = `demo-${randomUUID()}`;
    await firebaseAuth.createUser({ uid: accountId, email: `${accountId}@demo.ecocollect.test`, displayName: 'Demo Visitor' });
    let customToken: string;
    try {
      await setRoles(firebaseAuth, accountId, roles);
      customToken = await firebaseAuth.createCustomToken(accountId);
    } catch (error) {
      return removeAccount(firebaseAuth, accountId, error);
    }
    await saveAccount(pool, firebaseAuth, accountId, postalCodes[randomInt(postalCodes.length)]);
    res.set('Cache-Control', 'no-store').json({ customToken });
  });
}
