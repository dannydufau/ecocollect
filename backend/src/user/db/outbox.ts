import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

const routingKeys = {
  ProfileUpdated: 'user.profile.updated',
  AccountDeactivated: 'user.account.deactivated',
} as const;

type UserEvent = {
  type: keyof typeof routingKeys;
  routingKey: string;
  data: Record<string, unknown> & { accountId: string };
  traceId?: string | null;
};

export async function enqueueEvent(client: Pick<PoolClient, 'query'>, event: UserEvent) {
  if (!Object.hasOwn(routingKeys, event.type) || routingKeys[event.type] !== event.routingKey) {
    throw new TypeError('Unknown User Service event or routing key.');
  }
  if (!event.data || typeof event.data.accountId !== 'string' || !/^[a-z0-9_-]{3,50}$/.test(event.data.accountId)) {
    throw new TypeError('A valid accountId is required for a User Service event.');
  }
  if (event.traceId != null && typeof event.traceId !== 'string') throw new TypeError('traceId must be a string or null.');
  const { rows } = await client.query('SELECT now() AS occurred_at');
  const envelope = {
    eventId: randomUUID(), type: event.type, version: 1,
    occurredAt: rows[0].occurred_at.toISOString(), producer: 'user-service',
    traceId: event.traceId ?? null, data: event.data,
  };
  await client.query(
    `INSERT INTO users.outbox (event_id, event_type, event_version, routing_key, aggregate_id, payload, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [envelope.eventId, event.type, envelope.version, event.routingKey, event.data.accountId, envelope, envelope.occurredAt],
  );
  return envelope;
}
