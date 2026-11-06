/**
 * Application error taxonomy. Messages are fixed, human-readable strings built from status codes
 * and paths only - never from response bodies, headers or credentials.
 */
export type ErrorKind =
  | 'auth-required'
  | 'auth-expired'
  | 'auth-cancelled'
  | 'no-access'
  | 'not-found'
  | 'rate-limited'
  | 'network'
  | 'invalid-config'
  | 'unsupported-schema'
  | 'server';

export class AppError extends Error {
  readonly kind: ErrorKind;
  readonly detail?: string;
  readonly retryAt?: number;

  constructor(kind: ErrorKind, message: string, options: { detail?: string; retryAt?: number } = {}) {
    super(message);
    this.name = 'AppError';
    this.kind = kind;
    this.detail = options.detail;
    this.retryAt = options.retryAt;
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

export function toAppError(e: unknown): AppError {
  if (isAppError(e)) return e;
  if (e instanceof TypeError) return new AppError('network', 'Could not reach GitHub. Check your connection and try again.');
  return new AppError('server', 'An unexpected error occurred.');
}

export const errorTitles: Record<ErrorKind, string> = {
  'auth-required': 'Sign-in required',
  'auth-expired': 'Your session has expired',
  'auth-cancelled': 'Sign-in cancelled',
  'no-access': 'No access to the IT repository',
  'not-found': 'Content not found',
  'rate-limited': 'GitHub rate limit reached',
  network: 'You appear to be offline',
  'invalid-config': 'Configuration problem',
  'unsupported-schema': 'Unsupported configuration version',
  server: 'Something went wrong'
};
