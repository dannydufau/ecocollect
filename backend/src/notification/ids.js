'use strict';

/*
* Builds each notification's id from the event id plus the recipient. 
* It's a valid UUID, so it fits the model's column, and the same event always produces the same id.
* It uses Node's built-in crypto.
*/
const crypto = require('node:crypto');

// Fixed namespace for notification ids. Any constant works; it must never change.
const NAMESPACE = Buffer.from('6f2b8c1e4d3a4b7e9c5d1a2f3e4b5c6d', 'hex');

/*
 * The same event and recipient always give the same UUID (version 5, from a SHA-1 hash),
 * so a redelivered event hits the notification's primary key instead of making a copy.
 */
function notificationUuid(eventId, uid) {
  const hash = crypto.createHash('sha1').update(NAMESPACE).update(`${eventId}:${uid}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // standard variant
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

module.exports = { notificationUuid };
