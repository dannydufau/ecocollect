import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import type { Pool } from 'pg';
import firebase from '../auth/firebase.cjs';
import { getPool } from '../db/pool.ts';
import { getCurrentTerms } from '../db/terms.ts';
import { createAccountUser } from '../firebase/accounts.ts';
import { HttpError, validationFailed } from '../http/errors.ts';
import { validateAccount } from '../validation/account.ts';

type Registration = Omit<Parameters<typeof createAccountUser>[2], 'displayName'> & {
  firstName: string;
  lastName: string;
  publicName: string;
  dateOfBirth: string;
  termsDocumentId: string;
  address?: { street: string; postalCode: string };
  preferredPostalCodes?: string[];
};
type Auth = Parameters<typeof createAccountUser>[0];
type Database = Pick<Pool, 'query' | 'connect'>;

const acceptanceTypes = {
  resident: 'AT_RESIDENT_REGISTRATION_OR_ACTIVATION',
  volunteer: 'AT_VOLUNTEER_REGISTRATION_OR_ACTIVATION',
};
const checkErrors: Record<string, [string, string]> = {
  account_ck1: ['username', 'Enter a valid username.'],
  account_ck2: ['firstName', 'Enter a first name.'],
  account_ck3: ['lastName', 'Enter a last name.'],
  account_ck4: ['publicName', 'Enter a public name.'],
  account_ck5: ['dateOfBirth', 'You must be at least 18 years old.'],
  resident_ck1: ['address.street', 'Enter a street.'],
  resident_ck2: ['address.postalCode', 'Enter a six-character Calgary postal code.'],
};

function validateStorageLengths(input: Registration): void {
  const fields: Record<string, string> = {};
  for (const name of ['firstName', 'lastName', 'publicName'] as const) {
    if ([...input[name]].length > 80) fields[name] = 'Use at most 80 characters.';
  }
  if (input.role === 'resident' && input.address && [...input.address.street].length > 255) {
    fields['address.street'] = 'Use at most 255 characters.';
  }
  if (Object.keys(fields).length) throw validationFailed(fields);
}

async function requireCurrentTerms(database: Pick<Pool, 'query'>, id: string): Promise<void> {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) ||
      (await getCurrentTerms(database)).termsDocumentId !== id.toLowerCase()) {
    throw new HttpError(409, 'terms_outdated', 'Please review and accept the current terms.');
  }
}

function registrationError(error: unknown, postalIndex: number): unknown {
  if (!error || typeof error !== 'object' || !('code' in error) || !('constraint' in error) ||
      typeof error.constraint !== 'string') return error;
  if (error.code === '23505' && error.constraint === 'account_pk') {
    return new HttpError(409, 'username_taken', 'This username is already taken.');
  }
  if (error.code !== '23514') return error;
  if (error.constraint === 'volunteer_preferred_postal_code_ck1') {
    return validationFailed({ [`preferredPostalCodes[${postalIndex}]`]: 'Enter a six-character Calgary postal code.' });
  }
  const field = checkErrors[error.constraint];
  return field ? validationFailed({ [field[0]]: field[1] }) : error;
}

async function saveRegistration(database: Database, auth: Auth, accountId: string, input: Registration): Promise<void> {
  let commitStarted = false;
  let postalIndex = 0;
  try {
    const client = await database.connect();
    let discardClient = false;
    try {
      await client.query('BEGIN');
      await requireCurrentTerms(client, input.termsDocumentId);
      await client.query(
        `INSERT INTO users.account (account_id, first_name, last_name, public_name, date_of_birth, created_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [accountId, input.firstName, input.lastName, input.publicName, input.dateOfBirth],
      );
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
          postalIndex++;
        }
      }
      await client.query(
        `INSERT INTO users.terms_acceptance (terms_acceptance_id, terms_document_id, account_id, accepted_at, type)
         VALUES ($1, $2, $3, now(), $4)`,
        [randomUUID(), input.termsDocumentId, accountId, acceptanceTypes[input.role]],
      );
      commitStarted = true;
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        discardClient = true;
        throw new AggregateError([error, rollbackError], 'Could not roll back account registration.');
      }
      throw error;
    } finally {
      client.release(discardClient);
    }
  } catch (error) {
    // If the connection dropped during COMMIT, the account may already exist.
    if (commitStarted) {
      console.error('Could not confirm the registration commit:', error);
      throw new HttpError(500, 'internal_error', 'We could not confirm registration. Try signing in before registering again.');
    }
    try {
      await auth.deleteUser(accountId);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Could not save registration or remove the Firebase account.');
    }
    throw registrationError(error, postalIndex);
  }
}

export function register(app: Express, {
  database = getPool, auth = firebase.getFirebaseAuth,
}: { database?: () => Database; auth?: () => Auth } = {}): void {
  app.post('/api/accounts', async (req, res) => {
    const pool = database();
    const { rows: [{ now }] } = await pool.query('SELECT now() AS now');
    const fields = validateAccount(req.body, now);
    if (Object.keys(fields).length) throw validationFailed(fields);
    const input = req.body as Registration;
    validateStorageLengths(input);
    await requireCurrentTerms(pool, input.termsDocumentId);

    const firebaseAuth = auth();
    const accountExists = async (uid: string) => {
      const result = await pool.query('SELECT 1 FROM users.account WHERE account_id = $1', [uid]);
      return result.rows.length > 0;
    };
    let accountId: string;
    try {
      const user = await createAccountUser(firebaseAuth, accountExists, { ...input, displayName: input.publicName }, now);
      accountId = user.uid;
    } catch (error) {
      if (error instanceof Error && 'code' in error &&
          (error.code === 'auth/invalid-password' || error.code === 'auth/password-does-not-meet-requirements')) {
        throw validationFailed({ password: error.message });
      }
      throw error;
    }

    await saveRegistration(pool, firebaseAuth, accountId, input);
    res.status(201).json({ accountId, roles: [input.role] });
  });
}
