'use strict';

// Event handlers for the notification service: turn a domain event into the
// SSE signals to send, as plain data. No hub, no broker, no I/O here; the
// caller delivers the result. That keeps these pure and easy to test.

const SIGNAL = Object.freeze({
  REQUEST_CREATED: 'REQUEST_CREATED',
  NEW_MATCHING_REQUEST: 'NEW_MATCHING_REQUEST',
});

// The only shape a signal may have: type + requestId. Built from scratch,
// never by copying event data, so nothing else (e.g. a street address) can
// leak to the browser even if the event carries it.
function signal(type, requestId) {
  return { type, requestId };
}

/**
 * RequestCreated → one signal to the resident who made the request, and one
 * to each matched volunteer.
 *
 * @param {object} envelope  { type: 'RequestCreated', data: { requestId, residentUid, matchedVolunteerUids } }
 * @returns {Array<{ uid: string, signal: { type: string, requestId: string } }>}
 */
function requestCreated(envelope) {
  const data = (envelope && envelope.data) || {};
  const { requestId, residentUid } = data;

  // Without a requestId the frontend can't refetch anything; throw so the
  // subscriber logs it and nacks the message.
  if (typeof requestId !== 'string' || requestId === '') {
    throw new Error('RequestCreated without a requestId');
  }

  const out = [];

  if (residentUid) {
    out.push({ uid: residentUid, signal: signal(SIGNAL.REQUEST_CREATED, requestId) });
  }

  // Tolerate a missing list, and send each volunteer one signal even if the
  // event lists them twice.  NOTE: Set keeps only first occurance - no dup signals
  const volunteers = new Set(Array.isArray(data.matchedVolunteerUids) ? data.matchedVolunteerUids : []);
  for (const uid of volunteers) {
    if (uid) out.push({ uid, signal: signal(SIGNAL.NEW_MATCHING_REQUEST, requestId) });
  }

  return out;
}

module.exports = { requestCreated, SIGNAL };