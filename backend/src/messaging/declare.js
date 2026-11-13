// Declares a consumer's queue, its DLQ and both exchanges, exactly as topology.js
// defines them. Separate from subscriber.js so setup can be tested on its own.

const { exchange, deadLetterExchange, queueArguments, deadLetterQueueName } = require('./topology');

// Called each time the subscriber connects or reconnects.
async function declareConsumerQueue(ch, { name: queueName, bindings }) {
  if (typeof queueName !== 'string' || queueName === '') {
    throw new TypeError('queue name is required');
  }
  if (!Array.isArray(bindings) || bindings.length === 0) {
    throw new TypeError(`queue '${queueName}' needs at least one binding`);
  }

  // Create the exchanges, or confirm they exist with these settings.
  await ch.assertExchange(exchange.name, exchange.type, { durable: exchange.durable });
  await ch.assertExchange(deadLetterExchange.name, deadLetterExchange.type, {
    durable: deadLetterExchange.durable,
  });

  // DLQ first: a message dead-lettered before its DLQ is bound is dropped silently.
  const dlq = deadLetterQueueName(queueName);
  const deadLetterKey = queueName; // RabbitMQ dead-letters with the queue's name as routing key
  await ch.assertQueue(dlq, { durable: true, arguments: { 'x-queue-type': 'quorum' } });
  await ch.bindQueue(dlq, deadLetterExchange.name, deadLetterKey);

  // Arguments must match exactly on every declare, or RabbitMQ closes the channel.
  await ch.assertQueue(queueName, { durable: true, arguments: queueArguments(queueName) });
  // Route matching events from ecocollect.events into this queue.
  for (const key of bindings) {
    await ch.bindQueue(queueName, exchange.name, key);
  }

  return { queue: queueName, deadLetterQueue: dlq };
}

module.exports = { declareConsumerQueue };
