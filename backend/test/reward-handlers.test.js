'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const handlers = require('../src/reward/handlers');

// A sample event, shaped like the examples in contracts/asyncapi.yaml.
function sampleEvent(type, extra = {}) {
  return {
    eventId: '0b9e5a2c-0000-4000-8000-000000000001',
    type,
    version: 1,
    data: {
      request: {
        requestId: '6c0f0000-0000-4000-8000-000000000002',
        residentUid: 'resident_one',
        categoryName: 'Computers/Laptops',
        quantity: 2,
        estimatedWeightKg: 5.0,
      },
      assignment: {
        assignmentId: 'a0000000-0000-4000-8000-000000000003',
        volunteerUid: 'volunteer_one',
      },
      ...extra,
    },
  };
}

// Awards without their random ids, so they can be compared.
function withoutIds(awards) {
  return awards.map(({ awardId, ...rest }) => rest);
}

test('delivery: 26 points to the volunteer and 13 to the resident', () => {
  const result = handlers.RequestAssignmentDelivered(sampleEvent('RequestAssignmentDelivered'));

  assert.equal(result.assignmentId, 'a0000000-0000-4000-8000-000000000003');
  assert.deepEqual(withoutIds(result.awards), [
    { accountId: 'volunteer_one', earnedAs: 'volunteer', points: 26, formula: '3 * quantity + 4 * estimatedWeightKg' },
    { accountId: 'resident_one', earnedAs: 'resident', points: 13, formula: '(3 * quantity + 4 * estimatedWeightKg) / 2' },
  ]);
});

test('delivery: publishes PointsAwardedDelivery', () => {
  const result = handlers.RequestAssignmentDelivered(sampleEvent('RequestAssignmentDelivered'));

  assert.equal(result.routingKey, 'reward.points.delivery');
  assert.equal(result.event.type, 'PointsAwardedDelivery');
  assert.equal(result.event.producer, 'reward-service');
  assert.equal(result.event.data.requestId, '6c0f0000-0000-4000-8000-000000000002');
  assert.deepEqual(result.event.data.awards, result.awards);
});

test('late cancellation: one award for the volunteer', () => {
  const event = sampleEvent('RequestAssignmentCancelledResident', { outsideCancellationWindow: true });
  const result = handlers.RequestAssignmentCancelledResident(event);

  assert.deepEqual(withoutIds(result.awards), [
    { accountId: 'volunteer_one', earnedAs: 'volunteer', points: 26, formula: '3 * quantity + 4 * estimatedWeightKg' },
  ]);
  assert.equal(result.routingKey, 'reward.points.cancellation');
  assert.equal(result.event.type, 'PointsAwardedCancellation');
});

test('early cancellation: no points', () => {
  const event = sampleEvent('RequestAssignmentCancelledResident', { outsideCancellationWindow: false });
  assert.equal(handlers.RequestAssignmentCancelledResident(event), null);
});

test('cancellation of your own request: no points', () => {
  const event = sampleEvent('RequestAssignmentCancelledResident', { outsideCancellationWindow: true });
  event.data.assignment.volunteerUid = 'resident_one';
  assert.equal(handlers.RequestAssignmentCancelledResident(event), null);
});

test('an event with bad data throws', () => {
  const badQuantity = sampleEvent('RequestAssignmentDelivered');
  badQuantity.data.request.quantity = 0;
  assert.throws(() => handlers.RequestAssignmentDelivered(badQuantity));

  const noAssignment = sampleEvent('RequestAssignmentDelivered');
  delete noAssignment.data.assignment;
  assert.throws(() => handlers.RequestAssignmentDelivered(noAssignment));
});