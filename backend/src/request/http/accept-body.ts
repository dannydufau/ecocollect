// Q11 body shape checks (AcceptRequest in openapi.yaml), before the database
// call. Whether the window is one of the request's active future windows and
// whether the terms are current is req_accept's job.
import * as v from 'valibot';
import { parseBody, Uuid } from './body-validation.ts';

const AcceptRequest = v.strictObject({
  windowId: v.message(v.pipe(v.string(), v.minLength(1)), 'must be a window id'),
  termsDocumentId: v.message(v.pipe(v.string(), v.minLength(1)), 'must be the current terms document id'),
});

export type AcceptBody = {
  windowId: string | null;             // null: not a UUID
  termsDocumentId: string | null;      // null: not a UUID
};

export function parseAcceptBody(body: unknown): AcceptBody {
  const { windowId, termsDocumentId } = parseBody(AcceptRequest, body);

  // A string that isn't a UUID can't be cast in the database. It goes in as
  // null instead, and req_accept answers it in its usual order: terms ->
  // 409 terms_outdated, window -> 400 under windowId.
  return {
    windowId: v.is(Uuid, windowId) ? windowId : null,
    termsDocumentId: v.is(Uuid, termsDocumentId) ? termsDocumentId : null,
  };
}
