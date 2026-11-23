import type { PoolClient } from 'pg';

export async function hasOpenOrAssignedRequest(client: Pick<PoolClient, 'query'>, accountId: string): Promise<boolean> {
  const { rows: [{ locked }] } = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM users.terms_acceptance ta
       JOIN requests.pickup_request p ON p.terms_acceptance_id = ta.terms_acceptance_id
       CROSS JOIN LATERAL (
         SELECT s.status FROM requests.status_change s
         WHERE s.pickup_request_id = p.pickup_request_id
         ORDER BY s.changed_at DESC LIMIT 1
       ) current_state
       WHERE ta.account_id = $1 AND current_state.status IN ('Open', 'Assigned')
     ) AS locked`, [accountId],
  );
  return locked;
}
