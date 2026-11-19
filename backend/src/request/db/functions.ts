// One typed wrapper per database function the service calls. Each is a single
// pool.query: one function call that PostgreSQL commits on its own.
import type pg from 'pg';
import type { CategoryRow, FacilityRow } from '../domain/types.ts';

export async function listCategories(pool: pg.Pool): Promise<CategoryRow[]> {
  const { rows } = await pool.query<CategoryRow>(
    'SELECT * FROM ecocollect608.req_list_categories()');
  return rows;
}

// categoryId null = every facility.
export async function listFacilities(pool: pg.Pool, categoryId: string | null): Promise<FacilityRow[]> {
  const { rows } = await pool.query<FacilityRow>(
    'SELECT * FROM ecocollect608.req_list_facilities($1)', [categoryId]);
  return rows;
}
