import { z } from 'zod';

const text = (msg: string) => z.string({ required_error: msg, invalid_type_error: msg });

export const registerSchema = z.object({
  email: text('Enter a valid email').regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Enter a valid email'),
  password: text('Password must be at least 8 characters').min(8, 'Password must be at least 8 characters'),
});

/** Login accepts anything text-like; a wrong pair is always the same answer. */
export const loginSchema = z.object({
  email: z.string().catch(''),
  password: z.string().catch(''),
});
