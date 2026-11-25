// Q7 against the test database, checked against openapi.yaml.
// Needs: backend/scripts/request/load-db.sh --test,
// REQUEST_TEST_DATABASE_URL (see db.ts), and `npm ci` in contracts/. Other tests
// add assignments for the same volunteer, so this test checks its own request
// by id, not counts.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skipDb } from './db.ts';
import {
  contractChecks, createAssigned, owner, startApp, volunteer, type App, type Caller, type ContractChecks,
  type ErrorBody,
} from './helpers.ts';

const residentOnly = owner;   // resident1 has no volunteer role

type VolunteerAssignment = {
  requestId: string;
  category: { categoryId: string } | null;
  status: string | null;
  assignment: { status: string; endedAt: string | null };
};

describe('Q7 volunteer history', { skip: skipDb }, () => {
  let app: App;
  let check: ContractChecks;
  let isVolunteerList: (body: unknown) => boolean;
  before(async () => {
    check = await contractChecks('get', '/api/requests');
    // The view=volunteer branch itself: listRequests' 200 is an anyOf of the three views.
    const { default: contracts } = await import('../../../contracts/test/helpers.js');
    isVolunteerList = contracts.inline(contracts.openapi,
      { type: 'array', items: { $ref: '#/components/schemas/VolunteerAssignment' } });
    app = startApp();
  });
  after(() => app.close());

  // The caller's newest assignment (the first row), in the contract shape.
  const newest = async (query: string, caller: Caller): Promise<VolunteerAssignment> => {
    const res = await app.call('GET', `/api/requests?${query}`, caller);
    assert.equal(res.status, 200);
    assert.ok(isVolunteerList(res.body));
    return (res.body as VolunteerAssignment[])[0]!;
  };

  test('200: a new assignment comes first with its request; once cancelled, only the assignment', async () => {
    const requestId = await createAssigned(app.call, owner, volunteer);
    const active = await newest('view=volunteer', volunteer);
    assert.equal(active.requestId, requestId);
    assert.equal(active.assignment.status, 'Active');
    assert.equal(active.status, 'Assigned');
    assert.ok(active.category);

    const cancelled = await app.call('POST', `/api/requests/${requestId}/assignment/cancel`, volunteer);
    assert.equal(cancelled.status, 200);
    const ended = await newest('view=volunteer&assignmentStatus=Volunteer_Cancelled', volunteer);
    assert.equal(ended.requestId, requestId);
    assert.equal(ended.category, null);
    assert.equal(ended.status, null);
    assert.ok(ended.assignment.endedAt);
  });

  test('an unknown assignmentStatus is 400; a caller without the volunteer role is 403', async () => {
    const bad = await app.call('GET', '/api/requests?view=volunteer&assignmentStatus=Done', volunteer);
    check.expectError(bad, 400, 'validation_failed');
    assert.ok((bad.body as ErrorBody).error.details?.fields?.assignmentStatus);

    check.expectError(await app.call('GET', '/api/requests?view=volunteer', residentOnly), 403, 'forbidden');
  });
});
