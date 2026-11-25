'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const handlers = require('../src/cleanup/handlers');

// A sample event with the request snapshot fields the Cleanup Service uses.
function sampleEvent(type, request = {}) {
  return {
    eventId: '0b9e5a2c-0000-4000-8000-000000000001',
    type,
    data: {
      request: {
        requestId: '6c0f0000-0000-4000-8000-000000000002',
        requestSeq: 3,
        expiresAt: '2026-11-22T21:00:00Z',
        ...request,
      },
    },
  };
}

test('created or updated: the job runs at expiresAt', () => {
  for (const type of ['RequestCreated', 'RequestUpdated']) {
    assert.deepEqual(handlers[type](sampleEvent(type)), {
      requestId: '6c0f0000-0000-4000-8000-000000000002',
      requestSeq: 3,
      expiresAt: '2026-11-22T21:00:00Z',
    });
  }
});

test('assigned, cancelled or expired: no job', () => {
  for (const type of ['RequestAssigned', 'RequestCancelled', 'RequestExpired']) {
    assert.deepEqual(handlers[type](sampleEvent(type)), {
      requestId: '6c0f0000-0000-4000-8000-000000000002',
      requestSeq: 3,
      expiresAt: null,
    });
  }
});

test('an event with bad data throws', () => {
  assert.throws(() => handlers.RequestCreated(sampleEvent('RequestCreated', { requestSeq: undefined })));
  assert.throws(() => handlers.RequestCreated(sampleEvent('RequestCreated', { expiresAt: 'soon' })));
  assert.throws(() => handlers.RequestExpired(sampleEvent('RequestExpired', { requestId: undefined })));
});