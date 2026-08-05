import { s } from "../db/tables.ts";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../index.ts";
import { db, qGet, qRun } from "../db/index.ts";
import {
  categoryIdPrefix,
  ingredientStock,
  newId,
  nextCategoryCode,
  plDetails,
  plPeriodRanges,
  plSummary,
} from "../db/logic.ts";

const {
  ingredients,
  memberships,
  organizations,
  productionRuns,
  productionIngredientUsage,
  products,
  purchases,
  recipeLines,
} = s;

const ORG = "test_pl_org";
const USER = "test_pl_user";
const ING = "test_pl_ing";
const PROD = "test_pl_prod";

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

beforeAll(async () => {
  await qRun(
    db.insert(organizations).values({
      id: ORG,
      name: "PL Test Kitchen",
      ownerUserId: USER,
    }),
  );
  await qRun(
    db.insert(memberships).values({
      id: newId(),
      userId: USER,
      organizationId: ORG,
      role: "owner",
    }),
  );
  await qRun(
    db.insert(ingredients).values({
      id: ING,
      organizationId: ORG,
      name: "Flour",
      unit: "kg",
      category: "",
    }),
  );
  await qRun(
    db.insert(products).values({
      id: PROD,
      organizationId: ORG,
      name: "Bread",
      unit: "pc",
    }),
  );
  await qRun(
    db.insert(recipeLines).values({
      organizationId: ORG,
      productId: PROD,
      ingredientId: ING,
      qty: 0.5,
    }),
  );
  await qRun(
    db.insert(purchases).values({
      organizationId: ORG,
      date: "2026-07-01",
      kind: "Ingredient",
      itemId: ING,
      qty: 100,
      unitPrice: 2,
      total: 200,
      note: "",
    }),
  );
});

describe("nextCategoryCode", () => {
  it("assigns next number after the highest for a prefix", () => {
    expect(nextCategoryCode("ბ", ["ბ-01", "ბ-17", "ბ-20", "ა-99"])).toBe(
      "ბ-21",
    );
  });

  it("does not reuse a deleted lower number", () => {
    expect(nextCategoryCode("ბ", ["ბ-01", "ბ-20"])).toBe("ბ-21");
  });

  it("falls back to UUID when prefix is empty", () => {
    const id = nextCategoryCode("", []);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("maps full category name to Excel short letter", () => {
    const existing = [
      { id: "რ-01", category: "რძის ნაწარმი" },
      { id: "რ-08", category: "რძის ნაწარმი" },
      { id: "ბ-01", category: "ხილ-ბოსტანი" },
    ];
    expect(categoryIdPrefix("რძის ნაწარმი", existing)).toBe("რ");
    expect(categoryIdPrefix("ხილ-ბოსტანი", existing)).toBe("ბ");
    expect(
      nextCategoryCode(
        categoryIdPrefix("რძის ნაწარმი", existing),
        existing.map((r) => r.id),
      ),
    ).toBe("რ-09");
  });

  it("gives distinct prefixes when categories share a first letter", () => {
    const existing = [{ id: "n-01", category: "newone" }];
    expect(categoryIdPrefix("newone", existing)).toBe("n");
    expect(categoryIdPrefix("newww", existing)).toBe("ne");
    expect(
      nextCategoryCode(
        categoryIdPrefix("newww", existing),
        existing.map((r) => r.id),
      ),
    ).toBe("ne-01");
  });
});

describe("P&L logic", () => {
  it("summary net equals sum of daily net in plDetails", async () => {
    const ranges = plPeriodRanges(new Date("2026-07-15T12:00:00"));
    const summary = await plSummary(
      ORG,
      ranges.lastMonth.from,
      ranges.lastMonth.to,
    );
    const detail = await plDetails(
      ORG,
      ranges.lastMonth.from,
      ranges.lastMonth.to,
    );
    const dailyNet = detail.daily.reduce((sum, d) => sum + d.net, 0);
    expect(summary.net).toBeCloseTo(dailyNet, 2);
    expect(summary.unallocated + summary.allocated).toBeCloseTo(
      summary.ohTotal,
      2,
    );
  });
});

describe("stock guards", () => {
  it("rejects write-off when ingredient stock is insufficient", async () => {
    const res = await api("/api/write-offs", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-07-10",
        kind: "Ingredient",
        itemId: ING,
        qty: 99999,
        note: "test",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("ingredient stock ignores recipe changes after production snapshot", async () => {
    await qRun(
      db.insert(productionRuns).values({
        organizationId: ORG,
        date: "2026-07-05",
        productId: PROD,
        qty: 10,
        ingredientUnitCost: 1,
      }),
    );
    const run = await qGet(
      db
        .select({ id: productionRuns.id })
        .from(productionRuns)
        .where(eq(productionRuns.organizationId, ORG)),
    );
    await qRun(
      db.insert(productionIngredientUsage).values({
        organizationId: ORG,
        runId: run!.id,
        ingredientId: ING,
        qty: 5,
      }),
    );
    const stockBefore = await ingredientStock(ORG, ING);
    await qRun(
      db
        .update(recipeLines)
        .set({ qty: 2 })
        .where(eq(recipeLines.productId, PROD)),
    );
    const stockAfter = await ingredientStock(ORG, ING);
    expect(stockAfter).toBe(stockBefore);
  });
});
