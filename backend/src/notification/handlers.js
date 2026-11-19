'use strict';

/*
 * Event handlers for the notification service: turn a domain event into the
 * SSE signals to send, as plain data. No I/O here; the caller delivers them.
 */

const SIGNAL = Object.freeze({
  REQUEST_CREATED: 'REQUEST_CREATED',
  NEW_MATCHING_REQUEST: 'NEW_MATCHING_REQUEST',
});

/*
 * The only shape a signal may have. Built from scratch, never by copying event
 * data, so nothing else (e.g. a street address) can leak to the browser.
 */
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
  // v2 moved the request fields into data.request; v1 had them directly in data.
  const request = data.request ?? data;
  const { requestId, residentUid } = request;

  // Without a requestId there is nothing to refetch: throw, so the subscriber retries it.
  if (typeof requestId !== 'string' || requestId === '') {
    throw new Error('RequestCreated without a requestId');
  }

  const out = [];

  if (residentUid) {
    out.push({ uid: residentUid, signal: signal(SIGNAL.REQUEST_CREATED, requestId) });
  }

  // Tolerates a missing list; the Set sends each volunteer one signal even if listed twice.
  const volunteers = new Set(Array.isArray(data.matchedVolunteerUids) ? data.matchedVolunteerUids : []);
  for (const uid of volunteers) {
    if (uid) out.push({ uid, signal: signal(SIGNAL.NEW_MATCHING_REQUEST, requestId) });
  }

  return out;
}

module.exports = { requestCreated, SIGNAL };
