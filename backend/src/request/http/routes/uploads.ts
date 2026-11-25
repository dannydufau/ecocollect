// Q3 POST /api/uploads (residents for item photos, the assigned volunteer for
// delivery evidence): a signed one-time ticket the browser uploads to ImageKit with.
import { Router } from 'express';
import type { RouteDeps } from '../../app.ts';
import { checkUpload } from '../../db/functions.ts';
import { uploadTicket } from '../../json/responses.ts';
import { forbidden, requestUnavailable } from '../errors.ts';
import { callerOf } from '../gateway-user.ts';
import { parseUploadBody } from '../upload-body.ts';

export default function uploadsRouter({ pool, imagekit }: RouteDeps): Router {
  const router = Router();

  // Order: body shape (400; the purpose decides which check applies), then one
  // read-only call that checks the caller against the model tables (404 / 403),
  // then the ticket. No role guard: req_check_upload reads the roles itself.
  router.post('/api/uploads', async (req, res) => {
    const caller = callerOf(res);
    const body = parseUploadBody(req.body);

    const resultCode = await checkUpload(pool, caller.id, body.purpose, body.requestId);
    switch (resultCode) {
      case 'request_unavailable':
        throw requestUnavailable();
      case 'forbidden':
        throw forbidden(body.purpose === 'item_photo'
          ? 'Only residents can upload item photos.'
          : 'Only the assigned volunteer of a collected request can upload delivery evidence.');
      case 'ok':
        break;
      default:
        throw new Error(`req_check_upload: unexpected result ${resultCode}`);
    }

    const ticket = imagekit.ticket({
      purpose: body.purpose, callerId: caller.id, requestId: body.requestId, contentType: body.contentType,
    });
    res.json(uploadTicket(ticket));
  });

  return router;
}
