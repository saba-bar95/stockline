import { s } from "./db/tables.ts";
import { createClerkClient, verifyToken } from "@clerk/backend";
import { eq, sql } from "drizzle-orm";
import type { Context, Next } from "hono";
import { db, qAll, qGet, qRun } from "./db/index.ts";
const { memberships, organizations } = s;
import { newId } from "./db/logic.ts";
export type AuthVars = {
    userId: string;
    organizationId: string;
    orgName: string;
};
const DEV_USER = "dev_local_user";
const DEV_ORG = "dev_local_org";
function maxOrgs(): number {
    const n = Number(process.env.MAX_ORGS ?? 25);
    return Number.isFinite(n) && n > 0 ? n : 25;
}
function registrationOpen(): boolean {
    return process.env.REGISTRATION_OPEN !== "false";
}
function clerkConfigured(): boolean {
    return Boolean(process.env.CLERK_SECRET_KEY);
}
async function ensureDevOrg() {
    const existing = await qGet(db
        .select()
        .from(organizations)
        .where(eq(organizations.id, DEV_ORG)));
    if (existing)
        return existing;
    await qRun(db.insert(organizations)
        .values({ id: DEV_ORG, name: "Local Kitchen", ownerUserId: DEV_USER }));
    await qRun(db.insert(memberships)
        .values({
        id: newId(),
        userId: DEV_USER,
        organizationId: DEV_ORG,
        role: "owner",
    }));
    return (await qGet(db
        .select()
        .from(organizations)
        .where(eq(organizations.id, DEV_ORG))))!;
}
async function bootstrapOrg(userId: string, displayName?: string) {
    if (!registrationOpen()) {
        return { error: "Registration is closed", status: 403 as const };
    }
    const count = (await qGet(db
        .select({ c: sql<number> `count(*)` })
        .from(organizations)))?.c ?? 0;
    if (count >= maxOrgs()) {
        return {
            error: `Free tier is full (${maxOrgs()} kitchens). New signups are paused.`,
            status: 403 as const,
        };
    }
    const orgId = newId();
    const name = (displayName?.trim() || "My Kitchen").slice(0, 80);
    await qRun(db.insert(organizations)
        .values({ id: orgId, name, ownerUserId: userId }));
    await qRun(db.insert(memberships)
        .values({ id: newId(), userId, organizationId: orgId, role: "owner" }));
    return { orgId, name };
}
export async function resolveAuth(userId: string): Promise<{
    ok: true;
    organizationId: string;
    orgName: string;
} | {
    ok: false;
    error: string;
    status: 403;
}> {
    const membership = await qGet(db
        .select()
        .from(memberships)
        .where(eq(memberships.userId, userId)));
    if (membership) {
        const org = await qGet(db
            .select()
            .from(organizations)
            .where(eq(organizations.id, membership.organizationId)));
        return {
            ok: true,
            organizationId: membership.organizationId,
            orgName: org?.name ?? "Kitchen",
        };
    }
    const created = await bootstrapOrg(userId);
    if ("error" in created) {
        return {
            ok: false,
            error: created.error ?? "Forbidden",
            status: 403 as const,
        };
    }
    return { ok: true, organizationId: created.orgId, orgName: created.name };
}
export async function authMiddleware(c: Context, next: Next) {
    if (c.req.path.endsWith("/health") || c.req.path.includes("/health")) {
        return next();
    }
    // Vitest: impersonate tenant via headers (never enabled in production)
    if (process.env.VITEST === "true") {
        const userId = c.req.header("X-Test-User-Id");
        const orgId = c.req.header("X-Test-Org-Id");
        if (userId && orgId) {
            c.set("userId", userId);
            c.set("organizationId", orgId);
            c.set("orgName", "Test Kitchen");
            return next();
        }
        return c.json({ error: "Unauthorized" }, 401);
    }
    // Local offline mode when Clerk is not configured
    if (!clerkConfigured()) {
        const org = await ensureDevOrg();
        c.set("userId", DEV_USER);
        c.set("organizationId", org.id);
        c.set("orgName", org.name);
        return next();
    }
    const header = c.req.header("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
        return c.json({ error: "Unauthorized" }, 401);
    }
    try {
        const payload = await verifyToken(token, {
            secretKey: process.env.CLERK_SECRET_KEY!,
        });
        const userId = payload.sub;
        if (!userId)
            return c.json({ error: "Unauthorized" }, 401);
        const auth = await resolveAuth(userId);
        if (!auth.ok)
            return c.json({ error: auth.error }, auth.status);
        c.set("userId", userId);
        c.set("organizationId", auth.organizationId);
        c.set("orgName", auth.orgName);
        return next();
    }
    catch {
        return c.json({ error: "Unauthorized" }, 401);
    }
}
export function getOrg(c: Context): string {
    return c.get("organizationId") as string;
}
export async function renameOrg(orgId: string, name: string) {
    await qRun(db.update(organizations)
        .set({ name: name.slice(0, 80) })
        .where(eq(organizations.id, orgId)));
}
export function getClerkClient() {
    if (!clerkConfigured())
        return null;
    return createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
}
const FRESH_OAUTH_MS = 120000;
function isGoogleProvider(provider: string) {
    return provider === "google" || provider === "oauth_google";
}
function externalAccountAgeMs(approvedAt: number | null | undefined): number | null {
    if (approvedAt == null)
        return null;
    const ms = approvedAt < 1e12 ? approvedAt * 1000 : approvedAt;
    return Date.now() - ms;
}
/** Block auto-linking Google to a password-only account; remove link if just added. */
export async function revokeFreshOAuthLink(userId: string): Promise<{
    blocked: boolean;
}> {
    const client = getClerkClient();
    if (!client)
        return { blocked: false };
    const user = await client.users.getUser(userId);
    if (!user.passwordEnabled)
        return { blocked: false };
    const google = user.externalAccounts.find((a) => isGoogleProvider(a.provider));
    if (!google)
        return { blocked: false };
    const age = externalAccountAgeMs((google as {
        approvedAt?: number;
        createdAt?: number;
    }).approvedAt ??
        (google as {
            createdAt?: number;
        }).createdAt);
    if (age == null || age > FRESH_OAUTH_MS)
        return { blocked: false };
    await client.users.deleteUserExternalAccount({
        userId,
        externalAccountId: google.id,
    });
    return { blocked: true };
}
