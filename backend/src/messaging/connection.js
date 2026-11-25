'use strict';

/*
 * The one file that imports amqplib: opens a RabbitMQ connection for the
 * subscriber and the outbox publisher, with the listeners both need.
 */

const amqp = require('amqplib');

// Without an 'error' listener a broker error would crash the process; onClose lets the caller reconnect.
async function openConnection(url, { name, onClose, connect = amqp.connect, log = console }) {
  const connection = await connect(url);
  connection.on('error', (err) => log.error(`[${name}] connection error: ${err.message}`));
  connection.on('close', onClose);
  return connection;
}

module.exports = { openConnection };
