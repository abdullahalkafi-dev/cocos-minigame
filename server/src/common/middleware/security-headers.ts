import type { RequestHandler } from 'express';

/**
 * Headers for every response. The dashboard and API must never be framed by other sites;
 * games (/g/), the SDK and uploads are meant to be embedded. Uploads are locked down so a hostile file cannot run code.
 */
export const securityHeaders = (https: boolean): RequestHandler => (req, res, next) => {
  if (https) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  const u = req.originalUrl;
  if (u.startsWith('/uploads/')) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox");
  }
  if (!/^\/(g|sdk|uploads)\//.test(u)) res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
};
