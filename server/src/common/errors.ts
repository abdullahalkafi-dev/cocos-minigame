/** An error that is safe to show to the caller. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(public status: number, message: string, public code = 'error', public extra?: Record<string, unknown>) {
    super(message);
  }
}

export const badRequest = (message: string, code = 'bad_request') => new AppError(400, message, code);
export const unauthorized = (message: string, code = 'unauthorized') => new AppError(401, message, code);
export const paymentRequired = (message: string, code = 'insufficient_balance') => new AppError(402, message, code);
export const forbidden = (message: string, code = 'forbidden') => new AppError(403, message, code);
export const notFound = (message: string, code = 'not_found') => new AppError(404, message, code);
export const conflict = (message: string, code = 'conflict') => new AppError(409, message, code);
export const tooLarge = (message: string, code = 'too_large') => new AppError(413, message, code);
