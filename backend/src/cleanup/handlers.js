'use strict';

// Cleanup rules for incoming events (contract 14.1 and 14.2).
// Each handler returns the change to make to the request's expiry job.
// expiresAt null means "no job".

function jobChange(request, expiresAt) {
  if (!request.requestId || !Number.isInteger(request.requestSeq)) {
    throw new Error('the event has no requestId or requestSeq');
  }
  return { requestId: request.requestId, requestSeq: request.requestSeq, expiresAt };
}

// E1, E2: the request is Open, so its job runs at expiresAt (14.1).
function scheduleJob(event) {
  const { request } = event.data;
  if (Number.isNaN(Date.parse(request.expiresAt))) {
    throw new Error(`expected a date for expiresAt, got ${request.expiresAt}`);
  }
  return jobChange(request, request.expiresAt);
}

// E3, E9, E10: the request is no longer Open, so it has no job (14.2).
function endJob(event) {
  return jobChange(event.data.request, null);
}

// Event type -> handler.
module.exports = {
  RequestCreated: scheduleJob,
  RequestUpdated: scheduleJob,
  RequestAssigned: endJob,
  RequestCancelled: endJob,
  RequestExpired: endJob,
};