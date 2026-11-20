import type { ErrorRequestHandler, RequestHandler, Response } from 'express';

export class HttpError extends Error {
  status: number;
  code: string;
  details?: { fields: Record<string, string> };

  constructor(status: number, code: string, message: string, details?: { fields: Record<string, string> }) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const validationFailed = (fields: Record<string, string>) =>
  new HttpError(400, 'validation_failed', 'Some fields are invalid.', { fields });

export function sendError(res: Response, error: HttpError): void {
  res.status(error.status).json({ error: {
    code: error.code, message: error.message,
    ...(error.details ? { details: error.details } : {}),
  } });
}

export const notFound: RequestHandler = (_req, res) => {
  sendError(res, new HttpError(404, 'not_found', 'Not found.'));
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof HttpError) return sendError(res, error);
  if (error?.type === 'entity.parse.failed') {
    return sendError(res, new HttpError(400, 'invalid_json', 'The body is not valid JSON.'));
  }
  if (error?.expose === true && error.status >= 400 && error.status < 500) {
    return sendError(res, new HttpError(error.status, 'invalid_body', 'The body could not be read.'));
  }
  console.error(`user service: ${req.method} ${req.path} trace=${req.get('X-Request-Id') ?? '-'}`, error);
  sendError(res, new HttpError(500, 'internal_error', 'Something went wrong. Nothing was saved; try again.'));
};
