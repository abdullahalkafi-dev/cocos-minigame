import { badRequest } from '../../common/errors.js';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function parseRegister(body: any): { email: string; password: string } {
  const { email, password } = body ?? {};
  if (typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email)) throw badRequest('Enter a valid email', 'invalid_email');
  if (typeof password !== 'string' || password.length < 8) throw badRequest('Password must be at least 8 characters', 'weak_password');
  if (password.length > 200) throw badRequest('Password is too long', 'weak_password');
  return { email, password };
}

/** Login accepts anything text-like; a wrong pair is always the same answer. */
export function parseLogin(body: any): { email: string; password: string } {
  const { email, password } = body ?? {};
  return { email: typeof email === 'string' ? email.slice(0, 254) : '', password: typeof password === 'string' ? password.slice(0, 200) : '' };
}
