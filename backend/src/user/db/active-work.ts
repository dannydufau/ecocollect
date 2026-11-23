import type { PoolClient } from 'pg';

export async function hasActiveWork(client: Pick<PoolClient, 'query'>, accountId: string): Promise<boolean> {
  const { rows: [{ active }] } = await client.query(
    `SELECT (
       EXISTS (
         SELECT 1 FROM users.terms_acceptance ta
         JOIN requests.pickup_request p ON p.terms_acceptance_id = ta.terms_acceptance_id
         CROSS JOIN LATERAL (
           SELECT s.status FROM requests.status_change s
           WHERE s.pickup_request_id = p.pickup_request_id
           ORDER BY s.changed_at DESC LIMIT 1
         ) current_state
         WHERE ta.account_id = $1 AND current_state.status IN ('Open', 'Assigned', 'Collected')
       ) OR EXISTS (
         SELECT 1 FROM users.terms_acceptance ta
         JOIN requests.assignment a ON a.terms_acceptance_id = ta.terms_acceptance_id
         WHERE ta.account_id = $1 AND a.ended_at IS NULL
       )
     ) AS active`, [accountId],
  );
  return active;
}
