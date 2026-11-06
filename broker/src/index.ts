/**
 * IT Hub token broker - stateless GitHub App token exchange.
 *
 * Why this exists: GitHub's OAuth token endpoint requires the client secret
 * (even with PKCE) and does not support CORS, so a static GitHub Pages PWA
 * cannot exchange an authorization code itself. This broker holds the client
 * secret and does nothing else: no storage, no cookies, no logging, no proxying
 * of repository content. Repository data is read by the browser directly from
 * api.github.com with the user's own token.
 *
 * Status: NOT DEPLOYED. Deployment requires Owner approval.
 *
 * Runtime: Web-standard fetch handler (Cloudflare Workers, Deno, Bun, or any
 * runtime that offers Request/Response/fetch).
 */

export interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  /** Exact origin of the PWA, e.g. https://fariesen.github.io */
  ALLOWED_ORIGIN: string;
  /** Exact redirect URI registered in the GitHub App. */
  REDIRECT_URI: string;
}

const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API = "https://api.github.com";
const MAX_BODY_BYTES = 4096;
const USER_AGENT = "it-hub-token-broker";

const TOKEN_FIELDS = [
  "access_token",
  "expires_in",
  "refresh_token",
  "refresh_token_expires_in",
  "token_type",
  "scope",
] as const;

/** GitHub OAuth error codes that may be passed through to the client. */
const PASSTHROUGH_ERRORS = new Set([
  "bad_verification_code",
  "bad_refresh_token",
  "redirect_uri_mismatch",
  "unsupported_grant_type",
  "invalid_grant",
  "access_denied",
]);

const RE_CODE = /^[A-Za-z0-9_-]{1,100}$/;
// RFC 7636: 43-128 chars of unreserved characters.
const RE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
const RE_TOKEN = /^[A-Za-z0-9_]{1,500}$/;

type Json = Record<string, unknown>;

class BrokerError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

function baseHeaders(): Headers {
  return new Headers({
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    Vary: "Origin",
  });
}

function withCors(headers: Headers, origin: string): Headers {
  headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function json(status: number, body: Json, origin?: string): Response {
  const headers = baseHeaders();
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (origin) withCors(headers, origin);
  return new Response(JSON.stringify(body), { status, headers });
}

function empty(status: number, origin?: string): Response {
  const headers = baseHeaders();
  if (origin) withCors(headers, origin);
  return new Response(null, { status, headers });
}

function isConfigured(env: Env): boolean {
  return Boolean(
    env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.ALLOWED_ORIGIN && env.REDIRECT_URI,
  );
}

async function readJsonBody(request: Request): Promise<Json> {
  const type = (request.headers.get("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (type !== "application/json") throw new BrokerError(415, "unsupported_media_type");

  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new BrokerError(413, "body_too_large");

  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX_BODY_BYTES) throw new BrokerError(413, "body_too_large");

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    throw new BrokerError(400, "invalid_json");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new BrokerError(400, "invalid_json");
  }
  return parsed as Json;
}

function field(body: Json, name: string, pattern: RegExp, missingCode: string): string {
  const value = body[name];
  if (typeof value !== "string" || value.length === 0) throw new BrokerError(400, missingCode);
  if (!pattern.test(value)) throw new BrokerError(400, `invalid_${name}`);
  return value;
}

async function callTokenEndpoint(env: Env, params: Record<string, string>): Promise<Json> {
  const form = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    client_secret: env.GITHUB_CLIENT_SECRET,
    ...params,
  });

  let res: Response;
  try {
    res = await fetch(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: form.toString(),
    });
  } catch {
    throw new BrokerError(502, "upstream_unavailable");
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new BrokerError(502, "upstream_invalid_response");
  }
  if (!data || typeof data !== "object") throw new BrokerError(502, "upstream_invalid_response");
  const obj = data as Json;

  // GitHub reports OAuth errors with HTTP 200 and an "error" field.
  if (typeof obj.error === "string") {
    if (obj.error === "incorrect_client_credentials") throw new BrokerError(500, "broker_misconfigured");
    const code = PASSTHROUGH_ERRORS.has(obj.error) ? obj.error : "oauth_error";
    throw new BrokerError(400, code);
  }
  if (!res.ok) throw new BrokerError(502, "upstream_error");
  if (typeof obj.access_token !== "string" || obj.access_token.length === 0) {
    throw new BrokerError(502, "upstream_invalid_response");
  }

  const out: Json = {};
  for (const key of TOKEN_FIELDS) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

async function handleToken(env: Env, body: Json): Promise<Json> {
  const code = field(body, "code", RE_CODE, "missing_code");
  const verifier = field(body, "code_verifier", RE_VERIFIER, "missing_code_verifier");
  const redirectUri = body.redirect_uri;
  if (typeof redirectUri !== "string" || redirectUri !== env.REDIRECT_URI) {
    throw new BrokerError(400, "invalid_redirect_uri");
  }
  return callTokenEndpoint(env, {
    code,
    code_verifier: verifier,
    redirect_uri: env.REDIRECT_URI,
  });
}

async function handleRefresh(env: Env, body: Json): Promise<Json> {
  const refreshToken = field(body, "refresh_token", RE_TOKEN, "missing_refresh_token");
  return callTokenEndpoint(env, { grant_type: "refresh_token", refresh_token: refreshToken });
}

async function handleRevoke(env: Env, body: Json): Promise<void> {
  const accessToken = field(body, "access_token", RE_TOKEN, "missing_access_token");
  const basic = btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`);
  let res: Response;
  try {
    res = await fetch(
      `${GITHUB_API}/applications/${encodeURIComponent(env.GITHUB_CLIENT_ID)}/token`,
      {
        method: "DELETE",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ access_token: accessToken }),
      },
    );
  } catch {
    throw new BrokerError(502, "upstream_unavailable");
  }
  // 404: token already invalid or revoked - the desired end state.
  if (res.status === 204 || res.status === 404) return;
  if (res.status === 401) throw new BrokerError(500, "broker_misconfigured");
  throw new BrokerError(502, "revoke_failed");
}

const ROUTES = new Set(["/token", "/refresh", "/revoke"]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!isConfigured(env)) return json(500, { error: "broker_misconfigured" });

    const origin = request.headers.get("Origin");
    if (origin !== env.ALLOWED_ORIGIN) return json(403, { error: "origin_not_allowed" });

    const path = new URL(request.url).pathname;
    if (!ROUTES.has(path)) return json(404, { error: "not_found" }, origin);

    if (request.method === "OPTIONS") {
      const headers = withCors(baseHeaders(), origin);
      headers.set("Access-Control-Allow-Methods", "POST");
      headers.set("Access-Control-Allow-Headers", "Content-Type");
      headers.set("Access-Control-Max-Age", "600");
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") return json(405, { error: "method_not_allowed" }, origin);

    try {
      const body = await readJsonBody(request);
      if (path === "/token") return json(200, await handleToken(env, body), origin);
      if (path === "/refresh") return json(200, await handleRefresh(env, body), origin);
      await handleRevoke(env, body);
      return empty(204, origin);
    } catch (err) {
      // Never include request data, upstream bodies or tokens in errors.
      if (err instanceof BrokerError) return json(err.status, { error: err.code }, origin);
      return json(500, { error: "internal_error" }, origin);
    }
  },
};
