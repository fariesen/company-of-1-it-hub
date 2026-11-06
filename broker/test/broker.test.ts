import { afterEach, describe, expect, it, vi } from "vitest";
import broker, { type Env } from "../src/index";

const ORIGIN = "https://fariesen.github.io";
const REDIRECT = "https://fariesen.github.io/company-of-1-it-hub/";
const SECRET = "test-client-secret-value";
const env: Env = {
  GITHUB_CLIENT_ID: "Iv23liTEST",
  GITHUB_CLIENT_SECRET: SECRET,
  ALLOWED_ORIGIN: ORIGIN,
  REDIRECT_URI: REDIRECT,
};
const VERIFIER = "a".repeat(43);
const ACCESS = "ghu_ACCESSTOKEN123";
const REFRESH = "ghr_REFRESHTOKEN456";

function req(path: string, init: RequestInit & { origin?: string | null } = {}): Request {
  const headers = new Headers(init.headers);
  const origin = init.origin === undefined ? ORIGIN : init.origin;
  if (origin) headers.set("Origin", origin);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return new Request(`https://broker.example${path}`, {
    method: init.method ?? "POST",
    headers,
    body: init.body,
  });
}

function mockFetch(response: Response | (() => Promise<Response>)) {
  const fn = vi.fn(async () => (typeof response === "function" ? response() : response.clone()));
  vi.stubGlobal("fetch", fn);
  return fn;
}

const ghJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("origin and CORS", () => {
  it("rejects a foreign origin with 403 and no CORS headers", async () => {
    const res = await broker.fetch(req("/token", { origin: "https://evil.example", body: "{}" }), env);
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("rejects a missing origin", async () => {
    const res = await broker.fetch(req("/token", { origin: null, body: "{}" }), env);
    expect(res.status).toBe(403);
  });

  it("answers preflight for the allowed origin", async () => {
    const res = await broker.fetch(req("/token", { method: "OPTIONS" }), env);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 404 for unknown routes", async () => {
    const res = await broker.fetch(req("/proxy", { body: "{}" }), env);
    expect(res.status).toBe(404);
  });

  it("rejects non-POST methods", async () => {
    const res = await broker.fetch(req("/token", { method: "GET" }), env);
    expect(res.status).toBe(405);
  });

  it("refuses to run without configuration", async () => {
    const res = await broker.fetch(req("/token", { body: "{}" }), { ...env, GITHUB_CLIENT_SECRET: "" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "broker_misconfigured" });
  });
});

describe("request validation", () => {
  it("rejects non-JSON content type", async () => {
    const res = await broker.fetch(
      req("/token", { body: "code=x", headers: { "Content-Type": "application/x-www-form-urlencoded" } }),
      env,
    );
    expect(res.status).toBe(415);
  });

  it("rejects malformed JSON", async () => {
    const res = await broker.fetch(req("/token", { body: "{not json" }), env);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_json" });
  });

  it("rejects oversized bodies", async () => {
    const res = await broker.fetch(req("/token", { body: JSON.stringify({ code: "x".repeat(5000) }) }), env);
    expect(res.status).toBe(413);
  });

  it("rejects a wrong redirect_uri without calling GitHub", async () => {
    const fetchMock = mockFetch(ghJson({}));
    const res = await broker.fetch(
      req("/token", {
        body: JSON.stringify({ code: "abc", code_verifier: VERIFIER, redirect_uri: "https://evil.example/" }),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_redirect_uri" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a PKCE code_verifier", async () => {
    const fetchMock = mockFetch(ghJson({}));
    const res = await broker.fetch(req("/token", { body: JSON.stringify({ code: "abc", redirect_uri: REDIRECT }) }), env);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_code_verifier" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a too-short code_verifier", async () => {
    const res = await broker.fetch(
      req("/token", { body: JSON.stringify({ code: "abc", code_verifier: "short", redirect_uri: REDIRECT }) }),
      env,
    );
    expect(await res.json()).toEqual({ error: "invalid_code_verifier" });
  });
});

describe("/token", () => {
  const body = JSON.stringify({ code: "abc123", code_verifier: VERIFIER, redirect_uri: REDIRECT });

  it("exchanges the code and returns only token fields", async () => {
    const fetchMock = mockFetch(
      ghJson({
        access_token: ACCESS,
        expires_in: 28800,
        refresh_token: REFRESH,
        refresh_token_expires_in: 15897600,
        token_type: "bearer",
        scope: "",
        unexpected: "dropped",
      }),
    );
    const res = await broker.fetch(req("/token", { body }), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const data = await res.json();
    expect(data).toEqual({
      access_token: ACCESS,
      expires_in: 28800,
      refresh_token: REFRESH,
      refresh_token_expires_in: 15897600,
      token_type: "bearer",
      scope: "",
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://github.com/login/oauth/access_token");
    const sent = new URLSearchParams(init.body as string);
    expect(sent.get("client_id")).toBe(env.GITHUB_CLIENT_ID);
    expect(sent.get("client_secret")).toBe(SECRET);
    expect(sent.get("code_verifier")).toBe(VERIFIER);
    expect(sent.get("redirect_uri")).toBe(REDIRECT);
  });

  it("maps known GitHub OAuth errors", async () => {
    mockFetch(ghJson({ error: "bad_verification_code", error_description: "The code passed is incorrect or expired." }));
    const res = await broker.fetch(req("/token", { body }), env);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_verification_code" });
  });

  it("maps unknown GitHub errors to a generic code", async () => {
    mockFetch(ghJson({ error: "something_new", error_description: `contains ${SECRET}` }));
    const res = await broker.fetch(req("/token", { body }), env);
    expect(await res.json()).toEqual({ error: "oauth_error" });
  });

  it("reports wrong client credentials as misconfiguration", async () => {
    mockFetch(ghJson({ error: "incorrect_client_credentials" }));
    const res = await broker.fetch(req("/token", { body }), env);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "broker_misconfigured" });
  });

  it("handles network failure", async () => {
    mockFetch(() => Promise.reject(new TypeError("network down")));
    const res = await broker.fetch(req("/token", { body }), env);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "upstream_unavailable" });
  });

  it("never echoes tokens, secrets or request data in error responses", async () => {
    mockFetch(new Response(`<html>${ACCESS} ${SECRET}</html>`, { status: 500 }));
    const res = await broker.fetch(req("/token", { body }), env);
    const text = await res.text();
    expect(res.status).toBe(502);
    for (const needle of [ACCESS, SECRET, "abc123", VERIFIER]) expect(text).not.toContain(needle);
  });
});

describe("/refresh", () => {
  it("refreshes with grant_type=refresh_token", async () => {
    const fetchMock = mockFetch(ghJson({ access_token: ACCESS, expires_in: 28800, refresh_token: REFRESH }));
    const res = await broker.fetch(req("/refresh", { body: JSON.stringify({ refresh_token: REFRESH }) }), env);
    expect(res.status).toBe(200);
    const sent = new URLSearchParams((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.get("grant_type")).toBe("refresh_token");
    expect(sent.get("refresh_token")).toBe(REFRESH);
  });

  it("maps bad_refresh_token", async () => {
    mockFetch(ghJson({ error: "bad_refresh_token" }));
    const res = await broker.fetch(req("/refresh", { body: JSON.stringify({ refresh_token: REFRESH }) }), env);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_refresh_token" });
  });

  it("rejects malformed refresh tokens", async () => {
    const res = await broker.fetch(req("/refresh", { body: JSON.stringify({ refresh_token: "x y" }) }), env);
    expect(await res.json()).toEqual({ error: "invalid_refresh_token" });
  });
});

describe("/revoke", () => {
  it("calls the GitHub revoke API with basic auth", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 204 }));
    const res = await broker.fetch(req("/revoke", { body: JSON.stringify({ access_token: ACCESS }) }), env);
    expect(res.status).toBe(204);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.github.com/applications/${env.GITHUB_CLIENT_ID}/token`);
    expect(init.method).toBe("DELETE");
    expect(new Headers(init.headers).get("Authorization")).toBe(
      `Basic ${btoa(`${env.GITHUB_CLIENT_ID}:${SECRET}`)}`,
    );
    expect(JSON.parse(init.body as string)).toEqual({ access_token: ACCESS });
  });

  it("treats an already-revoked token as success", async () => {
    mockFetch(new Response(null, { status: 404 }));
    const res = await broker.fetch(req("/revoke", { body: JSON.stringify({ access_token: ACCESS }) }), env);
    expect(res.status).toBe(204);
  });

  it("reports other failures without details", async () => {
    mockFetch(new Response(`error ${ACCESS}`, { status: 500 }));
    const res = await broker.fetch(req("/revoke", { body: JSON.stringify({ access_token: ACCESS }) }), env);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain(ACCESS);
  });
});
