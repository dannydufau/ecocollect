'use strict';

// Receives E5 and E6 from RabbitMQ and saves the points (contract 9).
// Can be replaced by the shared consumer helper (#104) once it is ready.

const amqp = require('amqplib');
const handlers = require('./handlers');
const { saveResult } = require('./store');

const EXCHANGE = 'ecocollect.events';
const DEAD_LETTER_EXCHANGE = 'ecocollect.dlx';
const QUEUE = 'reward.request-events';
const ROUTING_KEYS = ['request.assignment.delivered', 'request.assignment.cancelled.resident'];

// Creates the exchanges and queues if they don't exist yet (contract 9.1 and the queue table).
async function setUp(channel) {
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
  await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'direct', { durable: true });

  await channel.assertQueue(QUEUE, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-delivery-limit': 4,
      'x-dead-letter-exchange': DEAD_LETTER_EXCHANGE,
      'x-dead-letter-routing-key': QUEUE,
    },
  });
  for (const key of ROUTING_KEYS) {
    await channel.bindQueue(QUEUE, EXCHANGE, key);
  }

  // Messages that can't be handled end up here.
  await channel.assertQueue(`${QUEUE}.dlq`, { durable: true, arguments: { 'x-queue-type': 'quorum' } });
  await channel.bindQueue(`${QUEUE}.dlq`, DEAD_LETTER_EXCHANGE, QUEUE);

  // One message at a time.
  await channel.prefetch(1);
}

// Handles one message: save it and ack, or reject it.
async function onMessage(pool, channel, msg) {
  let event;
  let result;
  try {
    event = JSON.parse(msg.content.toString());
    if (!Object.hasOwn(handlers, event.type)) throw new Error(`unknown type ${event.type}`);
    result = handlers[event.type](event);
  } catch (err) {
    // Unusable message (9.6): retrying won't fix it, so it goes straight to the DLQ.
    console.error(`[reward] unusable message ${event?.eventId}: ${err.message}`);
    channel.reject(msg, false);
    return;
  }

  try {
    await saveResult(pool, event.eventId, result);
    channel.ack(msg);
  } catch (err) {
    // Database problem (9.5): RabbitMQ tries again, and after 5 failures moves it to the DLQ.
    const attempts = msg.properties.headers?.['x-delivery-count'] ?? 0;
    console.error(`[reward] ${event.type} ${event.eventId} failed (earlier attempts: ${attempts}): ${err.message}`);
    channel.reject(msg, true);
  }
}

// Connects and starts listening. If RabbitMQ goes away, the service exits and Docker starts it
// again (restart: unless-stopped). Unacked messages are not lost: RabbitMQ sends them again.
async function startConsumer(pool, url) {
  try {
    const connection = await amqp.connect(url);
    connection.on('error', (err) => console.error(`[reward] RabbitMQ error: ${err.message}`));
    connection.on('close', () => stop('RabbitMQ connection closed'));

    const channel = await connection.createChannel();
    channel.on('error', (err) => console.error(`[reward] channel error: ${err.message}`));
    channel.on('close', () => stop('RabbitMQ channel closed'));

    await setUp(channel);
    await channel.consume(QUEUE, (msg) => (msg ? onMessage(pool, channel, msg) : stop('RabbitMQ cancelled the consumer')));
    console.log(`[reward] listening on ${QUEUE}`);
  } catch (err) {
    stop(err.message);
  }
}

function stop(reason) {
  console.error(`[reward] ${reason}, exiting`);
  process.exit(1);
}

module.exports = { startConsumer };