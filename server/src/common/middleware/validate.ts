import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { badRequest } from '../errors.js';

/** Validates (and strips) req.body with a zod schema. The first problem becomes the 400 message. */
export const validateBody = (schema: ZodTypeAny): RequestHandler => (req, _res, next) => {
  const r = schema.safeParse(req.body ?? {});
  if (!r.success) return next(badRequest(r.error.issues[0]?.message ?? 'Invalid request'));
  req.body = r.data;
  next();
};
