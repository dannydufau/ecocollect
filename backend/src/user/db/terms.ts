import type { PoolClient } from 'pg';
import { HttpError } from '../http/errors.ts';

export type CurrentTerms = { termsDocumentId: string; content: string; publishedAt: string };

export async function getCurrentTerms(client: Pick<PoolClient, 'query'>): Promise<CurrentTerms> {
  const { rows } = await client.query(
    `SELECT terms_document_id, content, published_at FROM users.terms_document
     WHERE published_at <= now()
     ORDER BY published_at DESC, terms_document_id DESC LIMIT 1`,
  );
  if (!rows[0]) throw new HttpError(500, 'internal_error', 'The terms are unavailable. Try again later.');
  const row = rows[0];
  return { termsDocumentId: row.terms_document_id, content: row.content, publishedAt: row.published_at.toISOString() };
}
