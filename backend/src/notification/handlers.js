'use strict';

const { notificationUuid } = require('./ids');

/*
 * Event handlers for the notification service: turn a domain event into deliveries,
 * one per recipient: the SSE signal, the notification, and whether to also push it.
 * Plain data, no I/O; the caller delivers them.
 */

const SIGNAL = Object.freeze({
  REQUEST_CREATED: 'REQUEST_CREATED',
  NEW_MATCHING_REQUEST: 'NEW_MATCHING_REQUEST',
});

/*
 * Per notification type: its title, the page its url opens,
 * whether it also goes by Web Push, and the body the stored list shows
 * until the request's details can be joined (the request tables aren't in db/init yet).
 */
const NOTIFICATION_TYPES = Object.freeze({
  REQUEST_CREATED: {
    title: 'Request posted', path: '/resident/requests/', push: false,
    listBody: 'Your pickup request is posted',
  },
  NEW_MATCHING_REQUEST: {
    title: 'New pickup near you', path: '/volunteer/requests/', push: true,
    listBody: 'A pickup request matches your area',
  },
});

// The only shape a signal may have: type + requestId. Built from scratch,
// never by copying event data, so nothing else (e.g. a street address) can
// leak to the browser even if the event carries it.
function signal(type, requestId) {
  return { type, requestId };
}

// The text of a request notification: only quantity, category and postal code, never an address.
function describe(request) {
  const { quantity, categoryName, postalCode } = request;
  if (!quantity || !categoryName || !postalCode) return 'Pickup request';
  return `${quantity} x ${categoryName} in ${postalCode}`;
}

/*
 * One notification, in the shape of the contract's SSE notification message.
 * The id comes from the event and recipient, so a redelivered event gives the same id.
 */
function notification(envelope, uid, type, request) {
  const { title, path, push } = NOTIFICATION_TYPES[type];
  return {
    notification: {
      notificationId: notificationUuid(envelope.eventId, uid),
      type,
      requestId: request.requestId,
      awardId: null,
      title,
      body: describe(request),
      url: `${path}${request.requestId}`,
      createdAt: envelope.occurredAt,
    },
    push,
  };
}

/**
 * RequestCreated: a delivery to the resident who made the request, and one
 * to each matched volunteer.
 *
 * @param {object} envelope  { eventId, type: 'RequestCreated', occurredAt, data }
 * @returns {Array<{ uid: string, signal: object, notification: object, push: boolean }>}
 */
function requestCreated(envelope) {
  const data = (envelope && envelope.data) || {};
  // v2 moved the request fields into data.request; v1 had them directly in data.
  const request = data.request ?? data;
  const { requestId, residentUid } = request;

  // Without a requestId the frontend can't refetch anything; throw so the
  // subscriber logs it and rejects it, so RabbitMQ retries it.
  if (typeof requestId !== 'string' || requestId === '') {
    throw new Error('RequestCreated without a requestId');
  }
  // The notification id is built from it.
  if (typeof envelope.eventId !== 'string' || envelope.eventId === '') {
    throw new Error('RequestCreated without an eventId');
  }

  const out = [];

  if (residentUid) {
    out.push({
      uid: residentUid,
      signal: signal(SIGNAL.REQUEST_CREATED, requestId),
      ...notification(envelope, residentUid, SIGNAL.REQUEST_CREATED, request),
    });
  }

  // Tolerates a missing list; the Set gives each volunteer one delivery even if listed twice.
  const volunteers = new Set(Array.isArray(data.matchedVolunteerUids) ? data.matchedVolunteerUids : []);
  for (const uid of volunteers) {
    if (!uid) continue;
    out.push({
      uid,
      signal: signal(SIGNAL.NEW_MATCHING_REQUEST, requestId),
      ...notification(envelope, uid, SIGNAL.NEW_MATCHING_REQUEST, request),
    });
  }

  return out;
}

module.exports = { requestCreated, SIGNAL, NOTIFICATION_TYPES };
