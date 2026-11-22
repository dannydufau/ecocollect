import type { Express } from 'express';
import { getPool } from '../db/pool.ts';
import { getCurrentTerms } from '../db/terms.ts';
import type { CurrentTerms } from '../db/terms.ts';

export function register(app: Express, readTerms: () => Promise<CurrentTerms> = () => getCurrentTerms(getPool())): void {
  app.get('/api/terms', async (_req, res) => {
    res.json(await readTerms());
  });
}
