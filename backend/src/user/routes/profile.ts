import type { Express } from 'express';
import firebase from '../../api/auth/firebase.js';
import { getPool } from '../db/pool.ts';
import { loadProfile } from '../db/profile.ts';
import type { Profile } from '../db/profile.ts';
import { HttpError } from '../http/errors.ts';

export function register(app: Express, readProfile: (accountId: string) => Promise<Profile> =
  accountId => loadProfile(getPool(), firebase.getFirebaseAuth(), accountId)): void {
  app.get('/api/profile', async (req, res) => {
    const accountId = req.get('X-User-Id');
    if (!accountId) throw new HttpError(401, 'unauthenticated', 'Sign in to view your profile.');
    res.json(await readProfile(accountId));
  });
}
