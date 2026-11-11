import type { Request } from 'express';

/** The token from "Authorization: Bearer <token>", or undefined. */
export function bearer(req: Request): string | undefined {
  const h = req.headers.authorization;
  return h && h.startsWith('Bearer ') ? h.slice(7).trim() : undefined;
}
