import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../index.ts";
import { db } from "../db/index.ts";
import { newId } from "../db/logic.ts";
import { ingredients, memberships, organizations } from "../db/schema.ts";

const ORG_A = "test_org_a";
const ORG_B = "test_org_b";
const USER_A = "test_user_a";
const USER_B = "test_user_b";
const ING_A = "test_ing_a";
const ING_B = "test_ing_b";

function api(
  path: string,
  init: RequestInit & { userId: string; orgId: string },
) {
  const headers = new Headers(init.headers);
  headers.set("X-Test-User-Id", init.userId);
  headers.set("X-Test-Org-Id", init.orgId);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return app.request(path, { ...init, headers }) as Promise<Response>;
}

beforeAll(() => {
  db.insert(organizations)
    .values([
      { id: ORG_A, name: "Kitchen A", ownerUserId: USER_A },
      { id: ORG_B, name: "Kitchen B", ownerUserId: USER_B },
    ])
    .run();

  db.insert(memberships)
    .values([
      { id: newId(), userId: USER_A, organizationId: ORG_A, role: "owner" },
      { id: newId(), userId: USER_B, organizationId: ORG_B, role: "owner" },
    ])
    .run();

  db.insert(ingredients)
    .values([
      {
        id: ING_A,
        organizationId: ORG_A,
        name: "Org A Flour",
        unit: "kg",
        category: "",
      },
      {
        id: ING_B,
        organizationId: ORG_B,
        name: "Org B Flour",
        unit: "kg",
        category: "",
      },
    ])
    .run();
});

describe("org isolation", () => {
  it("GET /health is public", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("rejects API requests without test auth headers", async () => {
    const res = await app.request("/api/ingredients");
    expect(res.status).toBe(401);
  });

  it("lists only ingredients belonging to the caller org", async () => {
    const res = await api("/api/ingredients", {
      method: "GET",
      userId: USER_A,
      orgId: ORG_A,
    });
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{ id: string; name: string }>;
    expect(rows.map((r) => r.id)).toEqual([ING_A]);
    expect(rows.every((r) => r.name !== "Org B Flour")).toBe(true);
  });

  it("returns 404 when reading another org ingredient history", async () => {
    const res = await api(`/api/ingredients/${ING_B}/history`, {
      method: "GET",
      userId: USER_A,
      orgId: ORG_A,
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when deleting another org ingredient", async () => {
    const res = await api(`/api/ingredients/${ING_B}`, {
      method: "DELETE",
      userId: USER_A,
      orgId: ORG_A,
    });
    expect(res.status).toBe(404);
    const stillThere = db
      .select()
      .from(ingredients)
      .where(eq(ingredients.id, ING_B))
      .get();
    expect(stillThere?.organizationId).toBe(ORG_B);
  });

  it("creates ingredients under the caller org only", async () => {
    const res = await api("/api/ingredients", {
      method: "POST",
      userId: USER_B,
      orgId: ORG_B,
      body: JSON.stringify({ name: "Sugar", unit: "kg" }),
    });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const row = db
      .select()
      .from(ingredients)
      .where(eq(ingredients.id, id))
      .get();
    expect(row?.organizationId).toBe(ORG_B);

    const listA = await api("/api/ingredients", {
      method: "GET",
      userId: USER_A,
      orgId: ORG_A,
    });
    const idsA = ((await listA.json()) as Array<{ id: string }>).map(
      (r) => r.id,
    );
    expect(idsA).not.toContain(id);
  });
});
