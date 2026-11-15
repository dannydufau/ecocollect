const amqp = require('amqplib');
const { exchange } = require('./topology');

const CONFIRM_TIMEOUT_MS = 5000;

// A table name goes into the SQL text (it can't be a $1 parameter), so only plain names are allowed.
const TABLE_NAME = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/; // e.g. rewards.outbox

function checkTable(table) {
  if (typeof table !== 'string' || !TABLE_NAME.test(table)) {
    throw new TypeError(`invalid outbox table name: ${table}`);
  }
  return table;
}

// Takes one unsent event, hands it to `send`, and marks it sent only if `send` worked.
// The row stays locked until then, so two publishers never take the same event.
// `table` is the service's outbox, e.g. 'rewards.outbox' (contract 9.3).
async function publishNext(pool, send, { table = 'outbox' } = {}) {
  checkTable(table);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT event_id, event_type, routing_key, payload FROM ${table}
       WHERE published_at IS NULL ORDER BY created_at, event_id
       LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    if (!rows[0]) {
      await client.query('COMMIT');
      return false;
    }
    await send(rows[0]);
    await client.query(`UPDATE ${table} SET published_at = now() WHERE event_id = $1`, [rows[0].event_id]);
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Resolves once the broker has confirmed it has the message, and rejects if it refuses.
// RabbitMQ stops confirming when it is low on disk or memory, so without a timeout the
// publisher would hang here and say nothing. A timeout makes it a normal error: roll back, log, retry.
function sendConfirmed(channel, timeoutMs = CONFIRM_TIMEOUT_MS) {
  return (row) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('RabbitMQ did not confirm in time')), timeoutMs);
      const options = {
        persistent: true,
        contentType: 'application/json',
        messageId: row.event_id,
        type: row.event_type,
      };
      channel.publish(exchange.name, row.routing_key, Buffer.from(JSON.stringify(row.payload)), options, (err) => {
        clearTimeout(timer);
        err ? reject(err) : resolve();
      });
    });
}

// Keeps looking for unsent events. If the broker is down it just tries again on the next tick,
// and the events wait safely in the database.
function startOutboxPublisher({ pool, url, intervalMs = 1000, table = 'outbox' }) {
  checkTable(table);
  let connection;
  let channel;
  let timer;
  let stopped = false;

  async function drop() {
    const old = connection;
    connection = channel = undefined;
    await old?.close().catch(() => {});
  }

  async function tick() {
    try {
      if (!channel) {
        connection = await amqp.connect(url);
        // Without a listener an 'error' event would crash the whole server.
        connection.on('error', (err) => console.error('RabbitMQ connection:', err.message));
        connection.on('close', () => (channel = undefined));
        channel = await connection.createConfirmChannel();
        await channel.assertExchange(exchange.name, exchange.type, { durable: exchange.durable });
      }
      const send = sendConfirmed(channel);
      while (await publishNext(pool, send, { table }));
    } catch (err) {
      console.error('Outbox publisher:', err.message);
      await drop();
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  }

  tick();
  return async function stop() {
    stopped = true;
    clearTimeout(timer);
    await drop();
  };
}

module.exports = { publishNext, sendConfirmed, startOutboxPublisher };
