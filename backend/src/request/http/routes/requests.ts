// Q4 POST /api/requests (residents): one request per item, in one database call.
// Q5-Q7 GET /api/requests: one handler, the view decides the role and the read.
// Q8 GET /api/requests/:id: any signed-in caller; the database decides what they see.
// Q9 PATCH /api/requests/:id (the owner): edit, delete an unused old photo, then the detail.
// Q10 POST /api/requests/:id/cancel (the owner): cancel, then the detail.
// Q11 POST /api/requests/:id/assignment (volunteers): accept, then the detail.
// Q12 POST /api/requests/:id/assignment/cancel (owner or assigned volunteer): cancel the assignment, then the detail.
// Q13 POST /api/requests/:id/assignment/collected (the owner): confirm, then the detail.
// Q14 POST /api/requests/:id/assignment/missed (the owner): report missed, then the detail and the rescheduled request.
// Q15 POST /api/requests/:id/assignment/delivery (the assigned volunteer): deliver, then the detail.
import { Router } from 'express';
import * as v from 'valibot';
import type { RouteDeps } from '../../app.ts';
import {
  accept, cancel, cancelAssignment, confirmCollected, createRequests, edit, getDetail, getRequests, listAvailable, listMine, recordDelivery,
  reportMissed,
} from '../../db/functions.ts';
import { availableRequest, createdRequest, myRequest, requestDetail } from '../../json/responses.ts';
import { parseAcceptBody } from '../accept-body.ts';
import { Uuid } from '../body-validation.ts';
import { parseCancelAssignmentBody } from '../cancel-assignment-body.ts';
import { parseCancelBody } from '../cancel-body.ts';
import { parseCreateRequestsBody } from '../create-requests-body.ts';
import { parseEditBody } from '../edit-body.ts';
import { parseRecordDeliveryBody } from '../record-delivery-body.ts';
import { parseReportMissedBody } from '../report-missed-body.ts';
import {
  forbidden, HttpError, requestUnavailable, termsOutdated, validationFailed, validationFailedFromDb,
} from '../errors.ts';
import { assertRole, callerOf, requireRole } from '../gateway-user.ts';
import { parseAvailableQuery, parseMineQuery, parseView } from '../list-requests-query.ts';

const IDEMPOTENCY_KEY_MAX = 200;       // idempotency_keys.idempotency_key is VARCHAR(200)

export default function requestsRouter({ pool, nudgePublisher, demo, imagekit }: RouteDeps): Router {
  const router = Router();

  router.post('/api/requests', requireRole('resident'), async (req, res) => {
    const caller = callerOf(res);

    // Optional header; when sent, 1-200 characters. undefined = not sent.
    const idempotencyKey = req.get('Idempotency-Key');
    if (idempotencyKey !== undefined
        && (idempotencyKey === '' || idempotencyKey.length > IDEMPOTENCY_KEY_MAX)) {
      throw validationFailed({ 'Idempotency-Key': `must be 1 to ${IDEMPOTENCY_KEY_MAX} characters` });
    }
    const body = parseCreateRequestsBody(req.body);

    // No photos until ImageKit is wired in (the body check refuses them), so
    // every item has null in both photo arrays.
    const noPhotos = body.categoryIds.map(() => null);
    const result = await createRequests(pool, {
      ...body,
      residentId: caller.id,
      idempotencyKey: idempotencyKey ?? null,
      photoFileIds: noPhotos,
      photoPaths: noPhotos,
      demo,
      traceId: caller.traceId,
    });

    switch (result.result_code) {
      case 'forbidden':
        throw forbidden('Only an active resident can create requests.');
      case 'terms_outdated':
        throw termsOutdated();
      case 'validation_failed':
        throw validationFailedFromDb(result.error_fields, result.error_messages);
      case 'ok':
        nudgePublisher();              // the RequestCreated events are in the outbox
        break;
      case 'replayed':
        break;                         // nothing written, nothing to publish
    }

    // A second, separate call: the requests as stored now (a replay shows their
    // current values). Every id is the caller's own, so a missing row is a bug.
    const ids = result.created_request_ids ?? [];
    const rows = await getRequests(pool, ids, caller.id);
    if (ids.length === 0 || rows.length !== ids.length) {
      throw new Error(`Q4: ${result.result_code} with ${ids.length} ids, ${rows.length} rows read`);
    }
    res.status(201).json({ requests: rows.map(createdRequest) });
  });

  // Order: view (400), role for that view (403), the view's filter (400), one read.
  router.get('/api/requests', async (req, res) => {
    const caller = callerOf(res);
    const { view, role } = parseView(req);
    assertRole(caller, role);

    switch (view) {
      case 'mine': {
        const { statuses } = parseMineQuery(req);
        const rows = await listMine(pool, caller.id, statuses);
        res.json(rows.map(myRequest));
        return;
      }
      case 'available': {
        const { postalCodes } = parseAvailableQuery(req);
        const rows = await listAvailable(pool, postalCodes);
        res.json(rows.map(availableRequest));
        return;
      }
      case 'volunteer':
        // Temporary, until Q7 is built.
        throw new HttpError(501, 'not_implemented', `view=${view} is not available yet.`);
    }
  });

  // A malformed id is answered like an unknown one (404, never 400): checked here
  // because the database would fail to cast it to UUID. No role check: a
  // caller who may not see the request gets the same 404 (NFR03).
  router.get('/api/requests/:id', async (req, res) => {
    const caller = callerOf(res);
    const id = req.params.id;
    if (!v.is(Uuid, id)) throw requestUnavailable();
    const row = await getDetail(pool, id, caller.id);
    if (row.result_code !== 'ok') throw requestUnavailable();
    res.json(requestDetail(row));
  });

  // Order: role (403), id (404), body shape (400), the ImageKit check of a new
  // photo, one write call; after commit, delete the old photo if no request uses
  // it (best effort, logged); then the detail. A failed photo check goes in as a
  // null path: req_edit answers it with the other fields, after its state checks.
  router.patch('/api/requests/:id', requireRole('resident'), async (req, res) => {
    const caller = callerOf(res);
    const id = req.params.id;
    if (!v.is(Uuid, id)) throw requestUnavailable();
    const body = parseEditBody(req.body);

    let filePath: string | null = null;
    if (body.fileId !== null) {
      filePath = await imagekit.verify({
        fileId: body.fileId, purpose: 'item_photo', callerId: caller.id, requestId: null,
      });
    }
    const result = await edit(pool, {
      requestId: id, residentId: caller.id, ...body, filePath, demo, traceId: caller.traceId,
    });
    switch (result.result_code) {
      case 'request_unavailable':
        throw requestUnavailable();
      case 'forbidden':
        throw forbidden('Only the owner of this request can edit it.');
      case 'not_open':
        throw new HttpError(409, 'not_open', 'Only an Open request can be edited.');
      case 'expired':
        nudgePublisher();              // the request was expired: RequestExpired is in the outbox
        throw new HttpError(409, 'expired', 'This request has expired.');
      case 'validation_failed':
        throw validationFailedFromDb(result.error_fields, result.error_messages);
      case 'ok':
        nudgePublisher();              // RequestUpdated is in the outbox (none when nothing differed)
        break;
    }

    // The edit is committed: a failed deletion only leaves an unused file behind.
    if (result.unreferenced_file_id !== null) {
      try {
        await imagekit.remove(result.unreferenced_file_id);
      } catch (err) {
        console.error(`request service: could not delete photo ${result.unreferenced_file_id}`, err);
      }
    }

    // Committed; a missing detail means another action changed it in between.
    const row = await getDetail(pool, id, caller.id);
    if (row.result_code !== 'ok') throw requestUnavailable();
    res.json(requestDetail(row));
  });

  // Order: role (403), id (404), body shape (400), one write call; then the
  // detail, as in Q11. Owner and state checks come from req_cancel.
  router.post('/api/requests/:id/cancel', requireRole('resident'), async (req, res) => {
    const caller = callerOf(res);
    const id = req.params.id;
    if (!v.is(Uuid, id)) throw requestUnavailable();
    const body = parseCancelBody(req.body);

    const result = await cancel(pool, { requestId: id, residentId: caller.id, ...body, traceId: caller.traceId });
    switch (result.result_code) {
      case 'request_unavailable':
        throw requestUnavailable();
      case 'forbidden':
        throw forbidden('Only the owner of this request can cancel it.');
      case 'window_ended':
        throw new HttpError(409, 'window_ended',
          'The pickup window has ended. Confirm the collection or report a missed pickup instead.');
      case 'not_cancellable':
        throw new HttpError(409, 'not_cancellable', 'This request can no longer be cancelled.');
      case 'expired':
        nudgePublisher();              // the request was expired: RequestExpired is in the outbox
        throw new HttpError(409, 'expired', 'This request has expired.');
      case 'ok':
        nudgePublisher();              // RequestCancelled (after E6 when it was Assigned) is in the outbox
        break;
    }

    // Committed; a missing detail means another action changed it in between.
    const row = await getDetail(pool, id, caller.id);
    if (row.result_code !== 'ok') throw requestUnavailable();
    res.json(requestDetail(row));
  });

  // Order: role (403), id (404, as in Q8), body shape (400), one write call;
  // then the detail as a second, separate call. Every other answer, including
  // the order of terms and window, comes from req_accept.
  router.post('/api/requests/:id/assignment', requireRole('volunteer'), async (req, res) => {
    const caller = callerOf(res);
    const id = req.params.id;
    if (!v.is(Uuid, id)) throw requestUnavailable();
    const body = parseAcceptBody(req.body);

    const result = await accept(pool, { requestId: id, volunteerId: caller.id, ...body, traceId: caller.traceId });
    switch (result.result_code) {
      case 'request_unavailable':
        throw requestUnavailable();
      case 'forbidden':
        throw forbidden('Only an active volunteer can accept requests.');
      case 'already_assigned':
        throw new HttpError(409, 'already_assigned', 'Another volunteer accepted this request first.');
      case 'not_open':
        throw new HttpError(409, 'not_open', 'This request is no longer open.');
      case 'expired':
        nudgePublisher();              // the request was expired: RequestExpired is in the outbox
        throw new HttpError(409, 'expired', 'This request has expired.');
      case 'terms_outdated':
        throw termsOutdated();
      case 'validation_failed':
        throw validationFailedFromDb(result.error_fields, result.error_messages);
      case 'ok':
        nudgePublisher();              // RequestAssigned is in the outbox
        break;
    }

    // The accept is committed. A missing detail means another action (e.g. the
    // owner cancelling) changed the request in between: answer as Q8 would now.
    const row = await getDetail(pool, id, caller.id);
    if (row.result_code !== 'ok') throw requestUnavailable();
    res.status(201).json(requestDetail(row));
  });

  // Order: id (404), body shape (400), one write call; then the detail, as in
  // Q11. No role guard: the caller is the owner or the assigned volunteer, which
  // only the database knows; req_cancel_assignment decides the side, `as`, the
  // state and the windows.
  router.post('/api/requests/:id/assignment/cancel', async (req, res) => {
    const caller = callerOf(res);
    const id = req.params.id;
    if (!v.is(Uuid, id)) throw requestUnavailable();
    const body = parseCancelAssignmentBody(req.body);

    const result = await cancelAssignment(pool, {
      requestId: id, actorId: caller.id, ...body, demo, traceId: caller.traceId,
    });
    switch (result.result_code) {
      case 'request_unavailable':
        throw requestUnavailable();
      case 'forbidden':
        throw forbidden('Only the owner or the assigned volunteer can cancel this assignment.');
      case 'already_collected':
        throw new HttpError(409, 'already_collected', 'The items were already collected.');
      case 'no_active_assignment':
        throw new HttpError(409, 'no_active_assignment', 'This request has no active assignment.');
      case 'window_ended':
        throw new HttpError(409, 'window_ended',
          'The pickup window has ended. Confirm the collection or report a missed pickup instead.');
      case 'validation_failed':
        throw validationFailedFromDb(result.error_fields, result.error_messages);
      case 'ok':
        nudgePublisher();              // E6 or E7, then E2 or E10, are in the outbox
        break;
    }

    // Committed. A volunteer whose cancellation expired the request may no longer
    // see it (Q8), so the answer is 404 as Q8 would give now, not a 500.
    const row = await getDetail(pool, id, caller.id);
    if (row.result_code !== 'ok') throw requestUnavailable();
    res.json(requestDetail(row));
  });

  // Order: role (403), id (404), one write call; then the detail, as in Q11.
  // No body. Owner and state checks come from req_confirm_collected.
  router.post('/api/requests/:id/assignment/collected', requireRole('resident'), async (req, res) => {
    const caller = callerOf(res);
    const id = req.params.id;
    if (!v.is(Uuid, id)) throw requestUnavailable();

    const result = await confirmCollected(pool, { requestId: id, residentId: caller.id, traceId: caller.traceId });
    switch (result.result_code) {
      case 'request_unavailable':
        throw requestUnavailable();
      case 'forbidden':
        throw forbidden('Only the owner of this request can confirm the collection.');
      case 'not_assigned':
        throw new HttpError(409, 'not_assigned', 'This request is not waiting for a collection.');
      case 'ok':
        nudgePublisher();              // RequestAssignmentCollected is in the outbox
        break;
    }

    // Committed; a missing detail means another action changed it in between.
    const row = await getDetail(pool, id, caller.id);
    if (row.result_code !== 'ok') throw requestUnavailable();
    res.json(requestDetail(row));
  });

  // Order: role (403), id (404), body shape (400), one write call; then the
  // missed request's detail and, when rescheduled, the new request as Q4 returns
  // it. Owner, state, terms and window checks come from req_report_missed.
  router.post('/api/requests/:id/assignment/missed', requireRole('resident'), async (req, res) => {
    const caller = callerOf(res);
    const id = req.params.id;
    if (!v.is(Uuid, id)) throw requestUnavailable();
    const body = parseReportMissedBody(req.body);

    const result = await reportMissed(pool, {
      requestId: id, residentId: caller.id, ...body, demo, traceId: caller.traceId,
    });
    switch (result.result_code) {
      case 'request_unavailable':
        throw requestUnavailable();
      case 'forbidden':
        throw forbidden('Only the owner of this request can report a missed pickup.');
      case 'not_assigned':
        throw new HttpError(409, 'not_assigned', 'This request is not waiting for a pickup.');
      case 'window_not_ended':
        throw new HttpError(409, 'window_not_ended',
          'The pickup window has not ended yet. You can report a missed pickup once it ends.');
      case 'terms_outdated':
        throw termsOutdated();
      case 'validation_failed':
        throw validationFailedFromDb(result.error_fields, result.error_messages);
      case 'ok':
        nudgePublisher();              // RequestAssignmentMissed, and RequestCreated if rescheduled, are in the outbox
        break;
    }

    // Committed; a missing detail means another action changed it in between.
    const row = await getDetail(pool, id, caller.id);
    if (row.result_code !== 'ok') throw requestUnavailable();

    // The new request is the caller's own and was just created, so a missing row is a bug.
    let rescheduledRequest = null;
    const newId = result.rescheduled_request_id;
    if (newId !== null) {
      const rows = await getRequests(pool, [newId], caller.id);
      if (rows.length !== 1) throw new Error(`Q14: rescheduled request ${newId} not read back`);
      rescheduledRequest = createdRequest(rows[0]!);
    }
    res.json({ request: requestDetail(row), rescheduledRequest });
  });

  // Order: role (403), id (404), body shape (400), the ImageKit check, one write
  // call; then the detail, as in Q11. A failed photo check goes in as a null
  // path: req_record_delivery answers it with the facility, after its state checks.
  router.post('/api/requests/:id/assignment/delivery', requireRole('volunteer'), async (req, res) => {
    const caller = callerOf(res);
    const id = req.params.id;
    if (!v.is(Uuid, id)) throw requestUnavailable();
    const body = parseRecordDeliveryBody(req.body);

    const filePath = await imagekit.verify({
      fileId: body.fileId, purpose: 'delivery_evidence', callerId: caller.id, requestId: id,
    });
    const result = await recordDelivery(pool, {
      requestId: id, volunteerId: caller.id, ...body, filePath, traceId: caller.traceId,
    });
    switch (result.result_code) {
      case 'request_unavailable':
        throw requestUnavailable();
      case 'forbidden':
        throw forbidden('Only the assigned volunteer can record the delivery.');
      case 'already_delivered':
        throw new HttpError(409, 'already_delivered', 'This request has already been delivered.');
      case 'not_collected':
        throw new HttpError(409, 'not_collected', 'The owner has not confirmed the collection yet.');
      case 'validation_failed':
        throw validationFailedFromDb(result.error_fields, result.error_messages);
      case 'ok':
        nudgePublisher();              // RequestAssignmentDelivered is in the outbox
        break;
    }

    // Committed; a missing detail means another action changed it in between.
    const row = await getDetail(pool, id, caller.id);
    if (row.result_code !== 'ok') throw requestUnavailable();
    res.json(requestDetail(row));
  });

  return router;
}
