// Q4 POST /api/requests (residents): one request per item, in one database call.
// Q5-Q7 GET /api/requests: one handler, the view decides the role and the read.
// Q8 GET /api/requests/:id: any signed-in caller; the database decides what they see.
import { Router } from 'express';
import * as v from 'valibot';
import type { RouteDeps } from '../../app.ts';
import { createRequests, getDetail, getRequests, listAvailable, listMine } from '../../db/functions.ts';
import { availableRequest, createdRequest, myRequest, requestDetail } from '../../json/responses.ts';
import { parseCreateRequestsBody, termsOutdated, Uuid } from '../create-requests-body.ts';
import { forbidden, HttpError, requestUnavailable, validationFailed, validationFailedFromDb } from '../errors.ts';
import { assertRole, callerOf, requireRole } from '../gateway-user.ts';
import { parseAvailableQuery, parseMineQuery, parseView } from '../list-requests-query.ts';

const IDEMPOTENCY_KEY_MAX = 200;       // idempotency_keys.idempotency_key is VARCHAR(200)

export default function requestsRouter({ pool, nudgePublisher, demo }: RouteDeps): Router {
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

  return router;
}
