'use strict';

// Consumes one service's queue from ecocollect.events.
//
// The queue is a topology.queues entry: a durable quorum queue shared by the
// service, declared (with its DLQ) by declare.js on every connect. Events wait
// in the queue while the service is down. Run one instance per queue: a second
// would split the events between them.

const amqp = require('amqplib');
const { events } = require('./topology');
const { declareConsumerQueue } = require('./declare');

const DEFAULT_RETRY_MS = 5000;
const DEFAULT_PREFETCH = 1; // one message at a time keeps each request's events in order

/**
 * Start consuming one queue
 *
 * @param {object}   opts
 * @param {object}   opts.queue       topology.queues.notification
 * @param {string}   [opts.url]       AMQP URL (defaults to RABBITMQ_URL)
 * @param {object}   opts.handlers    { [eventType]: (envelope, fields) => void|Promise };
 *                                    keys must be event names from topology.events
 * @param {Function} [opts.connect]   (url) => Promise<connection>; tests pass a fake
 * @param {object}   [opts.log]       console-like logger
 * @param {number}   [opts.retryMs]   reconnect delay
 * @param {number}   [opts.prefetch]  max unacked messages in flight
 * @returns {{ stop: () => Promise<void> }}
 */
function startSubscriber({
  queue: queueDef,
  url = process.env.RABBITMQ_URL,
  handlers = {},
  connect: openConnection = amqp.connect,
  log = console,
  retryMs = DEFAULT_RETRY_MS,
  prefetch = DEFAULT_PREFETCH,
} = {}) {
  if (!url) throw new Error('RABBITMQ_URL is not set');
  if (!queueDef) throw new Error('queue is required (a topology.queues entry)');
  const handlerByType = buildHandlerMap(handlers);

  let current = null;  // the AMQP connection in use right now, or null
  let timer = null;    // pending reconnect, so we never schedule two
  let stopped = false; // set by stop(); suppresses reconnects

  function scheduleReconnect(reason) {
    if (stopped || timer) return;
    log.warn(`[subscriber] ${reason}; retrying in ${retryMs} ms`);
    timer = setTimeout(() => {
      timer = null;
      connect();
    }, retryMs);
  }

  async function connect() {
    let attempt; // the AMQP connection this call opened
    try {
      attempt = await openConnection(url);
      if (stopped) {
        // stop() was called while we were connecting.
        await attempt.close().catch(() => {});
        return;
      }
      current = attempt;
      attempt.on('error', (err) => log.error('[subscriber] connection error:', err.message));
      attempt.on('close', () => {
        if (current === attempt) current = null;
        scheduleReconnect('connection closed');
      });

      const ch = await attempt.createChannel();
      // A channel-level failure leaves the connection up but stops delivery.
      // Close the connection so the normal reconnect path rebuilds everything.
      ch.on('error', (err) => log.error('[subscriber] channel error:', err.message));
      ch.on('close', () => {
        if (!stopped) attempt.close().catch(() => {});
      });

      const { queue } = await declareConsumerQueue(ch, queueDef);
      await ch.prefetch(prefetch);
      await ch.consume(queue, (msg) => onMessage(ch, attempt, msg), { noAck: false });

      log.info(`[subscriber] consuming ${queue}`);
    } catch (err) {
      if (current === attempt) current = null;
      scheduleReconnect(`connect failed: ${err.message}`);
      if (attempt) attempt.close().catch(() => {});
    }
  }

  function onMessage(ch, connection, msg) {
    if (msg === null) {
      // Broker cancelled the consumer (e.g. queue deleted). Start over.
      log.warn('[subscriber] consumer cancelled by broker');
      connection.close().catch(() => {});
      return;
    }

    let envelope;
    try {
      envelope = JSON.parse(msg.content.toString('utf8'));
    } catch (err) {
      log.error('[subscriber] dropping unparseable message:', err.message);
      safeAck(ch, msg);
      return;
    }

    const type = eventTypeOf(envelope);
    const handler = handlerByType.get(type);
    if (!handler) {
      // Tolerant reader: other request.* events are not ours to handle.
      log.debug?.(`[subscriber] no handler for ${type} (${msg.fields.routingKey}); skipping`);
      safeAck(ch, msg);
      return;
    }
    Promise.resolve()
      .then(() => handler(envelope, msg.fields))
      .then(
        () => safeAck(ch, msg),
        (err) => {
          // No requeue: a handler bug would otherwise loop forever, and a
          // dropped signal only costs a missed refresh.
          log.error(`[subscriber] handler for ${type} failed:`, err);
          safeNack(ch, msg);
        },
      );
  }

  // If the channel closed mid-handler, ack/nack throws. The message dies with
  // the exclusive queue anyway, so there is nothing to recover.
  function safeAck(ch, msg) {
    try { ch.ack(msg); } catch { /* channel closed */ }
  }

  function safeNack(ch, msg) {
    try { ch.nack(msg, false, false); } catch { /* channel closed */ }
  }

  async function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
    const connection = current;
    current = null;
    if (connection) await connection.close().catch(() => {});
  }

  connect();
  return { stop };
}

// Fail fast on startup: a misspelled event name would otherwise just never
// fire. A Map (not the plain object) also means a message whose type is
// "constructor" or "toString" can't reach an inherited Object method.
function buildHandlerMap(handlers) {
  const map = new Map();
  for (const [type, fn] of Object.entries(handlers)) {
    if (!Object.hasOwn(events, type)) {
      throw new Error(
        `No event '${type}' in topology.events (known: ${Object.keys(events).join(', ')})`,
      );
    }
    if (typeof fn !== 'function') {
      throw new TypeError(`Handler for '${type}' must be a function`);
    }
    map.set(type, fn);
  }
  return map;
}

// Envelope field that names the event. Adjust if asyncapi.yaml uses another name.
function eventTypeOf(envelope) {
  return envelope && envelope.type;
}

module.exports = { startSubscriber };
