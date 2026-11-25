'use strict';

/*
 * Messaging facade: the one module a service imports to use RabbitMQ.
 * Behind it: topology (names), declare (queues and DLQs), connection (amqplib),
 * subscriber (consume) and outbox (publish).
 */

const { startSubscriber } = require('./subscriber');
const { startOutboxPublisher } = require('./outbox');
const { queues } = require('./topology');

module.exports = { startSubscriber, startOutboxPublisher, queues };
