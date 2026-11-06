/**
 * Built-in security policy. These values are compiled into the public bundle on purpose: they are
 * not secrets, and they cannot be widened by any configuration file.
 */

/** GitHub accounts whose repositories may be used as data sources. */
export const ALLOWED_OWNERS: readonly string[] = ['fariesen'];

/** The only host the app sends credentials to (besides an approved token broker). */
export const GITHUB_API = 'https://api.github.com';

export const SUPPORTED_BOOTSTRAP_SCHEMAS = [1] as const;
export const SUPPORTED_CONFIG_SCHEMAS = [1] as const;
export const SUPPORTED_DEVICE_SCHEMAS = [1] as const;
export const SUPPORTED_SNAPSHOT_SCHEMAS = [1] as const;

/** Upper bounds that keep a malformed repository from exhausting the API quota or memory. */
export const LIMITS = {
  maxRepositories: 10,
  maxDevices: 500,
  maxDocuments: 400,
  maxFileBytes: 1_000_000,
  concurrency: 6
} as const;

export function isAllowedOwner(owner: string): boolean {
  return ALLOWED_OWNERS.some((o) => o.toLowerCase() === owner.toLowerCase());
}
