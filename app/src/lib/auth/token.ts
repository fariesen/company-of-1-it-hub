/**
 * PROTOTYPE sign-in: fine-grained personal access token.
 *
 * This works without any backend, but it is an owner-only prototype, not the production flow:
 * GitHub fine-grained tokens can only target repositories owned by the token's own account (or an
 * organisation), so collaborators on a personal account's private repository cannot create one for
 * it. Classic tokens are refused because their `repo` scope grants access to every private
 * repository of the user.
 */
import { AppError } from '../errors';

export const FINE_GRAINED_PREFIX = 'github_pat_';

export function validateTokenFormat(token: string): string {
  const t = token.trim();
  if (t.length === 0) throw new AppError('auth-required', 'Enter a fine-grained personal access token.');
  if (/^(ghp|gho|ghu|ghs|ghr)_/.test(t)) {
    throw new AppError(
      'auth-required',
      'This looks like a classic or OAuth token. The IT Hub only accepts fine-grained tokens limited to the IT repository with read-only Contents access.'
    );
  }
  if (!t.startsWith(FINE_GRAINED_PREFIX) || !/^github_pat_[A-Za-z0-9_]{20,255}$/.test(t)) {
    throw new AppError('auth-required', 'This is not a fine-grained personal access token (they start with "github_pat_").');
  }
  return t;
}
