// Sends the Request Service's stored events to RabbitMQ, oldest first.
// Each step is one function call that commits on its own:
//   claim (lease the oldest unsent event) -> send, wait for the broker's
//   confirm -> mark published.
// No lock is held across the network send: the lease stands in for it. If the
// send fails or the process dies, the lease runs out and the same event is
// claimed again, so delivery is at-least-once (consumers skip duplicate
// eventIds, contract 9.4) and later events wait behind it, keeping the order.
import amqp from 'amqplib';
import type pg from 'pg';
import topology from '../../messaging/topology.js';
import type { OutboxRow } from '../domain/types.ts';
import { buildEnvelope } from '../json/envelopes.ts';

export type PublisherOptions = {
  pool: pg.Pool;
  url: string;               // RABBITMQ_URL
  intervalMs?: number;       // how often to look for events when not nudged
  leaseSeconds?: number;     // how long a claimed event is reserved for this send
  confirmTimeoutMs?: number; // how long to wait for the broker's confirm
};

export type Publisher = {
  nudge(): void;             // look now (after a write), instead of at the next tick
  stop(): Promise<void>;
};

// An error's text for the log. A refused connection is an AggregateError (one
// attempt per address, IPv4 and IPv6) whose own message is empty.
function describe(err: unknown): string {
  if (err instanceof AggregateError) return err.errors.map(describe).join('; ');
  if (err instanceof Error) return err.message || err.name;
  return String(err);
}

// req_outbox_claim returns one row, all NULL when there is nothing to send.
type ClaimRow = OutboxRow | { [K in keyof OutboxRow]: null };

async function claim(pool: pg.Pool, leaseSeconds: number): Promise<OutboxRow | null> {
  const { rows } = await pool.query<ClaimRow>(
    'SELECT * FROM requests.req_outbox_claim($1)', [leaseSeconds]);
  const row = rows[0];
  return row === undefined || row.event_id === null ? null : row;
}

async function markPublished(pool: pg.Pool, eventId: string): Promise<void> {
  const { rows } = await pool.query<{ marked: boolean }>(
    'SELECT requests.req_outbox_mark_published($1) AS marked', [eventId]);
  // false: already marked by a claim that re-sent it after this lease ran out.
  if (rows[0]?.marked !== true) console.warn(`request publisher: ${eventId} was already marked published`);
}

// Resolves when the broker confirms it has the message (contract 9.2 properties).
// RabbitMQ stops confirming when it is low on disk or memory; the timeout turns
// that into a normal error instead of a silent hang.
function send(channel: amqp.ConfirmChannel, row: OutboxRow, timeoutMs: number): Promise<void> {
  const body = Buffer.from(JSON.stringify(buildEnvelope(row)));
  const options = { persistent: true, contentType: 'application/json', messageId: row.event_id, type: row.event_type };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('RabbitMQ did not confirm in time')), timeoutMs);
    channel.publish(topology.exchange.name, row.routing_key, body, options, (err) => {
      clearTimeout(timer);
      if (err) reject(err instanceof Error ? err : new Error(String(err)));
      else resolve();
    });
  });
}

export function startRequestPublisher(options: PublisherOptions): Publisher {
  const { pool, url, intervalMs = 1000, leaseSeconds = 30, confirmTimeoutMs = 5000 } = options;
  let model: amqp.ChannelModel | undefined;
  let channel: amqp.ConfirmChannel | undefined;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> | undefined;
  let again = false;                  // nudged while running: run once more
  let stopped = false;
  let lastError: string | undefined;  // the last logged failure, to log repeats once

  async function connect(): Promise<amqp.ConfirmChannel> {
    model = await amqp.connect(url);
    // Without 'error' listeners an AMQP error would crash the process.
    model.on('error', (err) => console.error('request publisher: connection:', err.message));
    model.on('close', () => { model = channel = undefined; });
    const ch = await model.createConfirmChannel();
    ch.on('error', (err: Error) => console.error('request publisher: channel:', err.message));
    ch.on('close', () => { channel = undefined; });
    await ch.assertExchange(topology.exchange.name, topology.exchange.type, { durable: topology.exchange.durable });
    channel = ch;
    return ch;
  }

  async function drop(): Promise<void> {
    const old = model;
    model = channel = undefined;
    await old?.close().catch(() => { });
  }

  // Sends events until the claim returns nothing (none unsent, or the oldest is leased).
  async function drain(): Promise<void> {
    const ch = channel ?? await connect();
    while (true) {
      const row = await claim(pool, leaseSeconds);
      if (row === null) return;
      try {
        await send(ch, row, confirmTimeoutMs);
      } catch (err) {
        throw new Error(`${row.event_type} ${row.event_id}: ${describe(err)}`);
      }
      await markPublished(pool, row.event_id);
    }
  }

  // On an error: log, drop the connection, try again at the next tick. The
  // failed event stays leased until then, so nothing overtakes it.
  // The same error on every tick (broker or database down) is logged once,
  // and again when it changes; a clean run logs the recovery.
  async function run(): Promise<void> {
    try {
      await drain();
      if (lastError !== undefined) console.log('request publisher: working again');
      lastError = undefined;
    } catch (err) {
      const text = describe(err);
      if (text !== lastError) console.error('request publisher:', text, '(retrying every tick)');
      lastError = text;
      await drop();
    }
  }

  function tick(): void {
    clearTimeout(timer);
    if (stopped) return;
    if (running) { again = true; return; }
    running = run().finally(() => {
      running = undefined;
      if (stopped) return;
      if (again) { again = false; setImmediate(tick); }
      else timer = setTimeout(tick, intervalMs);
    });
  }

  tick();
  return {
    nudge: tick,
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await running;
      await drop();
    },
  };
}
