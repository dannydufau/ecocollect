// Error responses in the contract's shape:
//   { "error": { "code": "snake_case_code", "message": "...", "details": { "fields": {...} } } }
// `code` is what the frontend relies on; `message` is for people.
import type { ErrorRequestHandler, RequestHandler, Response } from 'express';

export type ErrorDetails = { fields?: Record<string, string> };

// Thrown (or passed to next) by a route; the error handler below turns it into
// the response. Express 5 forwards errors thrown in async handlers on its own.
export class HttpError extends Error {
  status: number;
  code: string;
  details: ErrorDetails | undefined;

  constructor(status: number, code: string, message: string, details?: ErrorDetails) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// The errors every route shares. State errors (409) come from the database
// functions' result codes and are mapped where those are handled.
export const validationFailed = (fields: Record<string, string>) =>
  new HttpError(400, 'validation_failed', 'Some fields are invalid.', { fields });

// A write function's 'validation_failed': its two arrays are paired element
// by element (error_fields[i] goes with error_messages[i]).
export const validationFailedFromDb = (fields: string[], messages: string[]) =>
  validationFailed(Object.fromEntries(fields.map((field, i) => [field, messages[i] ?? ''])));

export const forbidden = (message: string) =>
  new HttpError(403, 'forbidden', message);

// Contract: "doesn't exist" and "you may not see it" get the same answer.
export const requestUnavailable = () =>
  new HttpError(404, 'request_unavailable', 'This request is no longer available.');

// Contract: a malformed, unknown or outdated terms id (Q4, Q11, ...).
export const termsOutdated = () =>
  new HttpError(409, 'terms_outdated', 'The terms have changed. Please refresh the page to accept the new terms.');

export function sendError(res: Response, err: HttpError): void {
  const body: { code: string; message: string; details?: ErrorDetails } =
    { code: err.code, message: err.message };
  if (err.details) body.details = err.details;
  res.status(err.status).json({ error: body });
}

// Any path or method this service doesn't serve (normally Caddy already
// answers those, so this is for direct calls during development).
export const notFound: RequestHandler = (_req, res) => {
  sendError(res, new HttpError(404, 'not_found', 'Not found.'));
};

// The last middleware. Known errors keep their status; a body that isn't valid
// JSON is a 400; any other body the JSON parser refuses (too large, unknown
// charset, ...) keeps the parser's 4xx; anything else is a bug: logged with the
// trace id, answered 500.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) return sendError(res, err);
  if (err?.type === 'entity.parse.failed') {
    return sendError(res, new HttpError(400, 'invalid_json', 'The body is not valid JSON.'));
  }
  // The parser marks its own client errors with expose = true and a 4xx status.
  if (err?.expose === true && err.status >= 400 && err.status < 500) {
    return sendError(res, new HttpError(err.status, 'invalid_body', 'The body could not be read.'));
  }
  console.error(`request service: ${req.method} ${req.path} trace=${req.get('X-Request-Id') ?? '-'}`, err);
  sendError(res, new HttpError(500, 'internal_error', 'Something went wrong. Nothing was saved; try again.'));
};
