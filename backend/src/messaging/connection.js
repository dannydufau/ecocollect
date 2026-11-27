'use strict';

/*
 * The one file that imports amqplib: opens a RabbitMQ connection for the
 * subscriber and the outbox publisher, with the listeners both need.
 */

const fs = require('fs');
const amqp = require('amqplib');

// For an amqps:// URL with a CA file, trust only certificates signed by that CA; amqp:// is unchanged.
function socketOptions(url, caFile) {
  if (!url.startsWith('amqps://') || !caFile) return {};
  return { ca: [fs.readFileSync(caFile)] };
}

// Without an 'error' listener a broker error would crash the process; onClose lets the caller reconnect.
async function openConnection(url, {
  name, onClose, connect = amqp.connect, log = console, caFile = process.env.RABBITMQ_CA_FILE,
}) {
  const connection = await connect(url, socketOptions(url, caFile));
  connection.on('error', (err) => log.error(`[${name}] connection error: ${err.message}`));
  connection.on('close', onClose);
  return connection;
}

module.exports = { openConnection, socketOptions };