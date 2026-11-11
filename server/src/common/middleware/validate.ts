import type { RequestHandler } from 'express';

/**
 * Validates and cleans req.body with a small function. The function returns the cleaned body or throws an
 * AppError (badRequest), whose message becomes the 400 answer.
 */
export const validateBody = <T>(parse: (body: any) => T): RequestHandler => (req, _res, next) => {
  req.body = parse(req.body ?? {});
  next();
};
