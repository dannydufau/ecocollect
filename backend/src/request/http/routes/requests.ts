// Q4 POST /api/requests (residents): one request per item, in one database call.
// Q5-Q7 GET /api/requests: one handler, the view decides the role and the read.
import { Router } from 'express';
import type { RouteDeps } from '../../app.ts';
import { createRequests, getRequests, listMine } from '../../db/functions.ts';
import { createdRequest, myRequest } from '../../json/responses.ts';
import { parseCreateRequestsBody, termsOutdated } from '../create-requests-body.ts';
import { forbidden, HttpError, validationFailed, validationFailedFromDb } from '../errors.ts';
import { assertRole, callerOf, requireRole } from '../gateway-user.ts';
import { parseMineQuery, parseView } from '../list-requests-query.ts';

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
      case 'available':
      case 'volunteer':
        // Temporary, until Q6 and Q7 are built.
        throw new HttpError(501, 'not_implemented', `view=${view} is not available yet.`);
    }
  });

  return router;
}
