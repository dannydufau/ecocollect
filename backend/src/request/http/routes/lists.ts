// Q1 GET /api/categories (any signed-in user) and
// Q2 GET /api/facilities?categoryId= (volunteers).
import { Router } from 'express';
import type pg from 'pg';
import { listCategories, listFacilities } from '../../db/functions.ts';
import { category, facility } from '../../json/responses.ts';
import { validationFailed } from '../errors.ts';
import { requireRole } from '../gateway-user.ts';

export function listsRouter(pool: pg.Pool): Router {
  const router = Router();

  router.get('/api/categories', async (_req, res) => {
    res.json((await listCategories(pool)).map(category));
  });

  router.get('/api/facilities', requireRole('volunteer'), async (req, res) => {
    // Optional; when given, one non-empty value (?categoryId=a&categoryId=b
    // arrives as an array).
    const categoryId = req.query.categoryId;
    if (categoryId !== undefined && (typeof categoryId !== 'string' || categoryId === '')) {
      throw validationFailed({ categoryId: 'must be one category id' });
    }
    const rows = await listFacilities(pool, categoryId ?? null);
    // Every category is accepted by at least one facility (ER diagram, ACCEPTS
    // 1..N), so no rows for a given categoryId means it isn't a category.
    if (categoryId !== undefined && rows.length === 0) {
      throw validationFailed({ categoryId: 'unknown category' });
    }
    res.json(rows.map(facility));
  });

  return router;
}
