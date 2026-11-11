import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../errors.js';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found', code: 'not_found' });
};

/** One place that turns every failure into `{ error, code }`. Unknown errors are logged and hidden. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
    return;
  }
  if (err?.code === 'LIMIT_FILE_SIZE') { res.status(413).json({ error: 'File is too large (max 12 MB)', code: 'too_large' }); return; }
  if (err?.name === 'MulterError') { res.status(400).json({ error: 'Send one file in the "file" field', code: 'bad_request' }); return; }
  if (err?.type === 'entity.parse.failed') { res.status(400).json({ error: 'Invalid JSON', code: 'bad_request' }); return; }
  const status = Number(err?.status ?? err?.statusCode);
  if (status >= 400 && status < 500) { res.status(status).json({ error: err.message, code: 'bad_request' }); return; }
  console.error(err);
  res.status(500).json({ error: 'Server error', code: 'server_error' });
};
