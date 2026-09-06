import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  clearSessionCookie,
  createSessionToken,
  isAuthenticated,
  isAuthenticatedRequest,
  passwordMatches,
  sessionTokenFromCookieHeader,
  setSessionCookie,
  sitePasswordConfigured,
  verifySessionToken,
} from "./auth";

const SECRET = "test-auth-secret";
const PASSWORD = "correct-horse";

describe("sitePasswordConfigured", () => {
  afterEach(() => {
    delete process.env.SITE_PASSWORD;
    delete process.env.AUTH_SECRET;
  });

  it("is false until both secrets exist", () => {
    expect(sitePasswordConfigured()).toBe(false);

    process.env.SITE_PASSWORD = PASSWORD;
    expect(sitePasswordConfigured()).toBe(false);

    process.env.AUTH_SECRET = SECRET;
    expect(sitePasswordConfigured()).toBe(true);
  });
});

describe("passwordMatches", () => {
  afterEach(() => {
    delete process.env.SITE_PASSWORD;
  });

  it("rejects when the site password is unset", () => {
    expect(passwordMatches("anything")).toBe(false);
  });

  it("accepts only the configured password", () => {
    process.env.SITE_PASSWORD = PASSWORD;

    expect(passwordMatches(PASSWORD)).toBe(true);
    expect(passwordMatches("wrong")).toBe(false);
    expect(passwordMatches("")).toBe(false);
    expect(passwordMatches(`${PASSWORD} `)).toBe(false);
  });
});

describe("session tokens", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = SECRET;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.AUTH_SECRET;
  });

  it("creates a token that verifies", () => {
    const token = createSessionToken();

    expect(token.includes(".")).toBe(true);
    expect(verifySessionToken(token)).toBe(true);
  });

  it("rejects missing, empty, and malformed tokens", () => {
    expect(verifySessionToken(undefined)).toBe(false);
    expect(verifySessionToken("")).toBe(false);
    expect(verifySessionToken("noperiod")).toBe(false);
    expect(verifySessionToken(".onlysig")).toBe(false);
    expect(verifySessionToken("not-base64.%%%")).toBe(false);
  });

  it("rejects a token signed with a different secret", () => {
    const token = createSessionToken();
    process.env.AUTH_SECRET = "some-other-secret";

    expect(verifySessionToken(token)).toBe(false);
  });

  it("rejects a tampered payload", () => {
    const token = createSessionToken();
    const [, signature] = token.split(".");
    const tampered = Buffer.from(JSON.stringify({ exp: 9999999999 })).toString(
      "base64url",
    );

    expect(verifySessionToken(`${tampered}.${signature}`)).toBe(false);
  });

  it("rejects an expired token", () => {
    const token = createSessionToken();

    vi.setSystemTime(
      new Date(Date.now() + (SESSION_MAX_AGE_SECONDS + 1) * 1000),
    );

    expect(verifySessionToken(token)).toBe(false);
  });

  it("still accepts a token before it expires", () => {
    const token = createSessionToken();

    vi.setSystemTime(
      new Date(Date.now() + (SESSION_MAX_AGE_SECONDS - 60) * 1000),
    );

    expect(verifySessionToken(token)).toBe(true);
  });

  it("refuses to mint a token without AUTH_SECRET", () => {
    delete process.env.AUTH_SECRET;
    expect(() => createSessionToken()).toThrow(/AUTH_SECRET/);
  });

  it("rejects verification when AUTH_SECRET is unset", () => {
    const token = createSessionToken();
    delete process.env.AUTH_SECRET;

    expect(verifySessionToken(token)).toBe(false);
  });
});

describe("cookie session helpers", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = SECRET;
    cookieStore.get.mockReset();
    cookieStore.set.mockReset();
    cookieStore.delete.mockReset();
  });

  afterEach(() => {
    delete process.env.AUTH_SECRET;
  });

  it("reads authentication from the session cookie", async () => {
    const token = createSessionToken();
    cookieStore.get.mockReturnValue({ value: token });

    expect(await isAuthenticated()).toBe(true);
  });

  it("is unauthenticated without a valid cookie", async () => {
    cookieStore.get.mockReturnValue(undefined);
    expect(await isAuthenticated()).toBe(false);

    cookieStore.get.mockReturnValue({ value: "bogus" });
    expect(await isAuthenticated()).toBe(false);
  });

  it("sets an httpOnly session cookie", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await setSessionCookie();

    expect(cookieStore.set).toHaveBeenCalledOnce();
    const [name, value, options] = cookieStore.set.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE);
    expect(verifySessionToken(value)).toBe(true);
    expect(options).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  });

  it("marks the cookie Secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await setSessionCookie();

    expect(cookieStore.set.mock.calls[0][2]).toMatchObject({ secure: true });
  });

  it("reads the session token out of a Cookie header", () => {
    const token = createSessionToken();
    expect(
      sessionTokenFromCookieHeader(`other=1; ${SESSION_COOKIE}=${token}`),
    ).toBe(token);
    expect(sessionTokenFromCookieHeader(null)).toBeUndefined();
  });

  it("authenticates a Request from its Cookie header", () => {
    const token = createSessionToken();
    const request = new Request("https://ranch.knipe.io/api/coi", {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });

    expect(isAuthenticatedRequest(request)).toBe(true);
    expect(
      isAuthenticatedRequest(new Request("https://ranch.knipe.io/api/coi")),
    ).toBe(false);
  });

  it("clears the session cookie", async () => {
    await clearSessionCookie();
    expect(cookieStore.delete).toHaveBeenCalledWith(SESSION_COOKIE);
  });
});
