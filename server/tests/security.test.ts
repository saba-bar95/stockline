import { describe, expect, it } from "vitest";
import type { Context } from "hono";
import { app } from "../index.ts";
import {
  clientIp,
  clerkAuthorizedParties,
  isPublicHealthPath,
  requireClerkAuth,
} from "../security.ts";

function api(
  path: string,
  init: RequestInit & {
    userId: string;
    orgId: string;
  },
) {
  const headers = new Headers(init.headers);
  headers.set("X-Test-User-Id", init.userId);
  headers.set("X-Test-Org-Id", init.orgId);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return app.request(path, { ...init, headers }) as Promise<Response>;
}

describe("security helpers", () => {
  it("treats only the health route as public", () => {
    expect(isPublicHealthPath("/api/health")).toBe(true);
    expect(isPublicHealthPath("/health")).toBe(true);
    expect(isPublicHealthPath("/api/foo/health")).toBe(false);
    expect(isPublicHealthPath("/api/ingredients")).toBe(false);
  });

  it("does not enable Clerk-optional mode under vitest", () => {
    expect(requireClerkAuth()).toBe(false);
  });

  it("allows localhost azp parties in non-production vitest", () => {
    const prev = process.env.CORS_ORIGIN;
    const prevParties = process.env.CLERK_AUTHORIZED_PARTIES;
    process.env.CORS_ORIGIN = "http://localhost:5173";
    delete process.env.CLERK_AUTHORIZED_PARTIES;
    expect(clerkAuthorizedParties()).toEqual(["http://localhost:5173"]);
    process.env.CORS_ORIGIN = prev;
    if (prevParties == null) delete process.env.CLERK_AUTHORIZED_PARTIES;
    else process.env.CLERK_AUTHORIZED_PARTIES = prevParties;
  });

  it("prefers platform IP headers over a spoofed X-Forwarded-For prefix", () => {
    const ctx = {
      req: {
        header: (name: string) =>
          ({
            "x-real-ip": "203.0.113.9",
            "x-forwarded-for": "198.51.100.1, 203.0.113.9",
          })[name],
      },
    } as Context;
    expect(clientIp(ctx)).toBe("203.0.113.9");
  });

  it("uses the rightmost X-Forwarded-For hop when no x-real-ip is set", () => {
    const ctx = {
      req: {
        header: (name: string) =>
          ({ "x-forwarded-for": "198.51.100.1, 10.0.0.8" })[name],
      },
    } as Context;
    expect(clientIp(ctx)).toBe("10.0.0.8");
  });
});

describe("API hardening", () => {
  it("keeps /api/health public and sets clickjacking headers", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });

  it("does not skip auth for paths that merely contain 'health'", async () => {
    const res = await app.request("/api/foo/health");
    expect(res.status).toBe(401);
  });

  it("marks tenant JSON as uncacheable", async () => {
    const res = await api("/api/ingredients", {
      method: "GET",
      userId: "sec_user",
      orgId: "sec_org",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/no-store/i);
  });

  it("rejects oversized JSON bodies", async () => {
    const body = JSON.stringify({
      name: "n".repeat(300_000),
      unit: "kg",
      category: "Dry",
    });
    const res = await api("/api/ingredients", {
      method: "POST",
      userId: "sec_user",
      orgId: "sec_org",
      headers: { "Content-Length": String(body.length) },
      body,
    });
    expect(res.status).toBe(413);
    const json = (await res.json()) as { code?: string };
    expect(json.code).toBe("payload_too_large");
  });
});
