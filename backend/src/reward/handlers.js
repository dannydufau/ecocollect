'use strict';

// Reward rules (contract 15.1 to 15.3).
// Each handler returns the awards to save and the event to publish, or null when no points are given.

const { randomUUID } = require('node:crypto');
const { deliveryPoints, VOLUNTEER_FORMULA, RESIDENT_FORMULA } = require('./points');

// The PointsAwarded event sent to RabbitMQ (contract 10.3, E11 and E12).
function pointsEvent(type, request, assignment, awards) {
  return {
    eventId: randomUUID(),
    type,
    version: 1,
    occurredAt: new Date().toISOString(),
    producer: 'reward-service',
    traceId: null,
    data: {
      requestId: request.requestId,
      assignmentId: assignment.assignmentId,
      categoryName: request.categoryName,
      quantity: request.quantity,
      estimatedWeightKg: request.estimatedWeightKg,
      awards,
    },
  };
}

// E5: one award for the volunteer and one for the resident (15.1).
function assignmentDelivered(event) {
  const { request, assignment } = event.data;
  const points = deliveryPoints(request.quantity, request.estimatedWeightKg);

  const awards = [
    { awardId: randomUUID(), accountId: assignment.volunteerUid, earnedAs: 'volunteer', points: points.volunteer, formula: VOLUNTEER_FORMULA },
    { awardId: randomUUID(), accountId: request.residentUid, earnedAs: 'resident', points: points.resident, formula: RESIDENT_FORMULA },  ];

  return {
    assignmentId: assignment.assignmentId,
    awards,
    routingKey: 'reward.points.delivery',
    event: pointsEvent('PointsAwardedDelivery', request, assignment, awards),
  };
}

// E6: one volunteer award, only for a late cancellation where the volunteer is not the resident (15.2, 15.3).
function assignmentCancelledResident(event) {
  const { request, assignment, outsideCancellationWindow } = event.data;
  if (outsideCancellationWindow !== true) return null;
  if (assignment.volunteerUid === request.residentUid) return null;

  const points = deliveryPoints(request.quantity, request.estimatedWeightKg);

  const awards = [
    { awardId: randomUUID(), accountId: assignment.volunteerUid, earnedAs: 'volunteer', points: points.volunteer, formula: VOLUNTEER_FORMULA },
  ];

  return {
    assignmentId: assignment.assignmentId,
    awards,
    routingKey: 'reward.points.cancellation',
    event: pointsEvent('PointsAwardedCancellation', request, assignment, awards),
  };
}

// Event type -> handler.
module.exports = {
  RequestAssignmentDelivered: assignmentDelivered,
  RequestAssignmentCancelledResident: assignmentCancelledResident,
};