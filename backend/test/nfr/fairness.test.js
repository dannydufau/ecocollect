// NFR05 fairness check. The case is in
// docs/Final Submission/ENSF607/6. Software quality/cases/nfr/NFR05-fairness.md
const test = require('node:test');
const assert = require('node:assert/strict');

const handlers = require('../../src/reward/handlers');

// The same request and assignment, varied only by who is involved and what regions they saved.
function event(type, { residentUid, volunteerUid, savedPostalCodes }, extra = {}) {
  return {
    eventId: '0b9e5a2c-0000-4000-8000-000000000001',
    type,
    version: 1,
    data: {
      request: {
        requestId: '6c0f0000-0000-4000-8000-000000000002',
        residentUid,
        categoryName: 'Computers/Laptops',
        quantity: 2,
        estimatedWeightKg: 5.0,
      },
      assignment: {
        assignmentId: 'a0000000-0000-4000-8000-000000000003',
        volunteerUid,
        ...(savedPostalCodes && { savedPostalCodes }),
      },
      ...extra,
    },
  };
}

const PEOPLE = [
  { residentUid: 'resident_one', volunteerUid: 'volunteer_one' },
  { residentUid: 'resident_two', volunteerUid: 'volunteer_two', savedPostalCodes: ['T2P'] },
  { residentUid: 'resident_three', volunteerUid: 'volunteer_three', savedPostalCodes: ['T3A', 'T2P', 'T1Y'] },
  { residentUid: 'demo-resident-1', volunteerUid: 'demo-volunteer-1', savedPostalCodes: [] },
];

// The parts of each award that must not depend on who earned it.
const outcome = (awards) => awards.map(({ earnedAs, points, formula }) => ({ earnedAs, points, formula }));

test('NFR05-N1: the same delivery earns the same points for any account or saved region', () => {
  const results = PEOPLE.map((p) => outcome(handlers.RequestAssignmentDelivered(event('RequestAssignmentDelivered', p)).awards));

  assert.deepEqual(results[0], [
    { earnedAs: 'volunteer', points: 26, formula: '3 * quantity + 4 * estimatedWeightKg' },
    { earnedAs: 'resident', points: 13, formula: '(3 * quantity + 4 * estimatedWeightKg) / 2' },
  ]);
  for (const result of results) assert.deepEqual(result, results[0]);
});

test('NFR05-N1: the same late cancellation earns the same points for any account or saved region', () => {
  const late = { outsideCancellationWindow: true };
  const results = PEOPLE.map((p) =>
    outcome(handlers.RequestAssignmentCancelledResident(event('RequestAssignmentCancelledResident', p, late)).awards));

  assert.deepEqual(results[0], [{ earnedAs: 'volunteer', points: 26, formula: '3 * quantity + 4 * estimatedWeightKg' }]);
  for (const result of results) assert.deepEqual(result, results[0]);
});
