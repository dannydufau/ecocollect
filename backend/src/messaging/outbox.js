const amqp = require('amqplib');

const EXCHANGE = 'ecocollect.events';

// Takes one unsent event, hands it to `send`, and marks it sent only if `send` worked.
// The row stays locked until then, so two publishers never take the same event.
async function publishNext(pool, send) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT event_id, routing_key, payload FROM outbox
       WHERE published_at IS NULL ORDER BY created_at, event_id
       LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    if (!rows[0]) {
      await client.query('COMMIT');
      return false;
    }
    await send(rows[0]);
    await client.query('UPDATE outbox SET published_at = now() WHERE event_id = $1', [rows[0].event_id]);
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
function sendConfirmed(channel) {
  return (row) =>
    new Promise((resolve, reject) => {
      const options = { persistent: true, contentType: 'application/json', messageId: row.event_id };
      channel.publish(EXCHANGE, row.routing_key, Buffer.from(JSON.stringify(row.payload)), options, (err) =>
        err ? reject(err) : resolve(),
      );
    });
}

// Keeps looking for unsent events. If the broker is down it just tries again on the next tick,
// and the events wait safely in the database.
function startOutboxPublisher({ pool, url, intervalMs = 1000 }) {
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
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
      }
      const send = sendConfirmed(channel);
      while (await publishNext(pool, send));
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

module.exports = { publishNext, sendConfirmed, startOutboxPublisher, EXCHANGE };
