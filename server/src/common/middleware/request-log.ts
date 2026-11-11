import type { RequestHandler } from 'express';

/** One line for every failed or slow request (successful fast ones stay quiet), so the logs show what matters. */
export const requestLog: RequestHandler = (req, res, next) => {
  const t0 = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (res.statusCode >= 400 || ms > 800) console.log(`${res.statusCode} ${req.method} ${req.originalUrl.split('?')[0]} ${Math.round(ms)}ms`);
  });
  next();
};
