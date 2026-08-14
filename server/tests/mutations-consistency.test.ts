import { s } from "../db/tables.ts";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../index.ts";
import { db, qGet, qRun } from "../db/index.ts";
import {
  formatQty,
  ingredientStock,
  newId,
  productStock,
  recipeUnitCost,
  resaleStock,
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
  resaleProducts,
  sales,
  writeOffs,
} = s;

const ORG = "test_mut_org";
const USER = "test_mut_user";
const ING = "test_mut_ing";
const PROD = "test_mut_prod";
const PROD_UNUSED = "test_mut_prod_unused";
const ING_UNUSED = "test_mut_ing_unused";
const RESALE = "test_mut_resale";

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
      name: "Mutations Test Kitchen",
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
    db.insert(ingredients).values([
      {
        id: ING,
        organizationId: ORG,
        name: "Sugar",
        unit: "kg",
        category: "dry",
      },
      {
        id: ING_UNUSED,
        organizationId: ORG,
        name: "Unused spice",
        unit: "kg",
        category: "dry",
      },
    ]),
  );
  await qRun(
    db.insert(products).values([
      {
        id: PROD,
        organizationId: ORG,
        name: "Cake",
        unit: "pc",
      },
      {
        id: PROD_UNUSED,
        organizationId: ORG,
        name: "Mistaken product",
        unit: "pc",
      },
    ]),
  );
  await qRun(
    db.insert(recipeLines).values({
      organizationId: ORG,
      productId: PROD,
      ingredientId: ING,
      qty: 2,
    }),
  );
  await qRun(
    db.insert(purchases).values({
      organizationId: ORG,
      date: "2026-06-01",
      kind: "Ingredient",
      itemId: ING,
      qty: 100,
      unitPrice: 5,
      total: 500,
      note: "",
    }),
  );
  await qRun(
    db.insert(resaleProducts).values({
      id: RESALE,
      organizationId: ORG,
      name: "Bottled water",
      unit: "pc",
      category: "drinks",
    }),
  );
  await qRun(
    db.insert(purchases).values({
      organizationId: ORG,
      date: "2026-06-01",
      kind: "Product",
      itemId: RESALE,
      qty: 10,
      unitPrice: 2,
      total: 20,
      note: "",
    }),
  );
});

describe("formatQty", () => {
  it("rounds float noise for stock error messages", () => {
    expect(formatQty(0.5449996999999998)).toBe("0.54");
    expect(formatQty(1)).toBe("1");
    expect(formatQty(2.567)).toBe("2.57");
  });
});

describe("recipe unit cost consistency", () => {
  it("matches purchase average × recipe qty", async () => {
    // avg = 500/100 = 5; recipe uses 2 → unit cost 10
    expect(await recipeUnitCost(ORG, PROD)).toBeCloseTo(10, 6);
  });
});

describe("production edit/delete consistency", () => {
  it("creates a run, reduces ingredient stock, increases product stock", async () => {
    const ingBefore = await ingredientStock(ORG, ING);
    const prodBefore = await productStock(ORG, PROD);

    const res = await api("/api/production", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-06-10",
        productId: PROD,
        qty: 10,
      }),
    });
    expect(res.status).toBe(201);

    // 10 cakes × 2 kg = 20 kg used
    expect(await ingredientStock(ORG, ING)).toBeCloseTo(ingBefore - 20, 6);
    expect(await productStock(ORG, PROD)).toBeCloseTo(prodBefore + 10, 6);
  });

  it("allows editing qty when stock still covers the new usage", async () => {
    const run = await qGet(
      db
        .select()
        .from(productionRuns)
        .where(
          and(
            eq(productionRuns.organizationId, ORG),
            eq(productionRuns.productId, PROD),
          ),
        ),
    );
    expect(run).toBeTruthy();

    const ingBefore = await ingredientStock(ORG, ING);
    const prodBefore = await productStock(ORG, PROD);

    // Reduce 10 → 5: returns 10 kg ingredients, removes 5 product units
    const res = await api(`/api/production/${run!.id}`, {
      method: "PATCH",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-06-10",
        productId: PROD,
        qty: 5,
      }),
    });
    expect(res.status).toBe(200);
    expect(await ingredientStock(ORG, ING)).toBeCloseTo(ingBefore + 10, 6);
    expect(await productStock(ORG, PROD)).toBeCloseTo(prodBefore - 5, 6);
  });

  it("blocks editing qty up beyond available ingredient stock", async () => {
    const run = await qGet(
      db
        .select()
        .from(productionRuns)
        .where(
          and(
            eq(productionRuns.organizationId, ORG),
            eq(productionRuns.productId, PROD),
          ),
        ),
    );
    expect(run).toBeTruthy();

    // Current: purchased 100, used 5×2=10 → stock 90. Need 200 → 400 kg.
    const res = await api(`/api/production/${run!.id}`, {
      method: "PATCH",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-06-10",
        productId: PROD,
        qty: 200,
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string; code?: string };
    expect(body.error || body.code).toBeTruthy();
  });

  it("blocks deleting a production run after its product was sold", async () => {
    const run = await qGet(
      db
        .select()
        .from(productionRuns)
        .where(
          and(
            eq(productionRuns.organizationId, ORG),
            eq(productionRuns.productId, PROD),
          ),
        ),
    );
    expect(run).toBeTruthy();

    await qRun(
      db.insert(sales).values({
        organizationId: ORG,
        date: "2026-06-15",
        source: "manufactured",
        itemId: PROD,
        qty: 5,
        unitPrice: 20,
        revenue: 100,
      }),
    );

    const res = await api(`/api/production/${run!.id}`, {
      method: "DELETE",
      userId: USER,
      orgId: ORG,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("purchase_timeline");

    // Stock must remain consistent after rejected delete
    expect(await productStock(ORG, PROD)).toBeCloseTo(0, 6);
  });

  it("allows deleting a production run when no later product outs exist", async () => {
    // Clean sale that blocked delete
    await qRun(
      db.delete(sales).where(eq(sales.organizationId, ORG)),
    );

    const run = await qGet(
      db
        .select()
        .from(productionRuns)
        .where(
          and(
            eq(productionRuns.organizationId, ORG),
            eq(productionRuns.productId, PROD),
          ),
        ),
    );
    expect(run).toBeTruthy();

    const ingBefore = await ingredientStock(ORG, ING);
    const usage = await qGet(
      db
        .select()
        .from(productionIngredientUsage)
        .where(eq(productionIngredientUsage.runId, run!.id)),
    );

    const res = await api(`/api/production/${run!.id}`, {
      method: "DELETE",
      userId: USER,
      orgId: ORG,
    });
    expect(res.status).toBe(200);
    expect(await productStock(ORG, PROD)).toBeCloseTo(0, 6);
    expect(await ingredientStock(ORG, ING)).toBeCloseTo(
      ingBefore + Number(usage?.qty ?? 0),
      6,
    );
  });
});

describe("master-data unit guards", () => {
  it("allows changing a material unit when operations exist", async () => {
    const res = await api(`/api/ingredients/${ING}`, {
      method: "PATCH",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        name: "Sugar",
        unit: "l",
        category: "dry",
      }),
    });
    expect(res.status).toBe(200);
    const row = await qGet(
      db
        .select()
        .from(ingredients)
        .where(and(eq(ingredients.organizationId, ORG), eq(ingredients.id, ING))),
    );
    expect(row?.unit).toBe("l");
    await qRun(
      db
        .update(ingredients)
        .set({ unit: "kg" })
        .where(and(eq(ingredients.organizationId, ORG), eq(ingredients.id, ING))),
    );
  });

  it("allows canonicalizing a legacy material unit while operations exist", async () => {
    await qRun(
      db
        .update(ingredients)
        .set({ unit: "კგ" })
        .where(and(eq(ingredients.organizationId, ORG), eq(ingredients.id, ING))),
    );
    const res = await api(`/api/ingredients/${ING}`, {
      method: "PATCH",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        name: "Sugar",
        unit: "kg",
        category: "dry",
      }),
    });
    expect(res.status).toBe(200);
    const row = await qGet(
      db
        .select()
        .from(ingredients)
        .where(and(eq(ingredients.organizationId, ORG), eq(ingredients.id, ING))),
    );
    expect(row?.unit).toBe("kg");
  });

  it("allows changing the unit of an unused material", async () => {
    const res = await api(`/api/ingredients/${ING_UNUSED}`, {
      method: "PATCH",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        name: "Unused spice",
        unit: "pc",
        category: "dry",
      }),
    });
    expect(res.status).toBe(200);
  });
});

describe("master-data delete guards", () => {
  it("allows deleting an unused product and unused material", async () => {
    const prodDel = await api(`/api/products/${PROD_UNUSED}`, {
      method: "DELETE",
      userId: USER,
      orgId: ORG,
    });
    expect(prodDel.status).toBe(200);

    const ingDel = await api(`/api/ingredients/${ING_UNUSED}`, {
      method: "DELETE",
      userId: USER,
      orgId: ORG,
    });
    expect(ingDel.status).toBe(200);
  });

  it("blocks deleting a material that has purchases or recipe usage", async () => {
    const res = await api(`/api/ingredients/${ING}`, {
      method: "DELETE",
      userId: USER,
      orgId: ORG,
    });
    expect(res.status).toBe(409);
  });

  it("blocks deleting a product that has production history", async () => {
    // Recreate a run so PROD has ops again
    const create = await api("/api/production", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-06-20",
        productId: PROD,
        qty: 1,
      }),
    });
    expect(create.status).toBe(201);

    const res = await api(`/api/products/${PROD}`, {
      method: "DELETE",
      userId: USER,
      orgId: ORG,
    });
    expect(res.status).toBe(409);
  });
});

describe("sales edit/delete consistency", () => {
  it("creates a sale and reduces product stock", async () => {
    expect(await productStock(ORG, PROD)).toBeCloseTo(1, 6);

    const res = await api("/api/sales", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-06-21",
        source: "manufactured",
        itemId: PROD,
        qty: 1,
        unitPrice: 20,
      }),
    });
    expect(res.status).toBe(201);
    expect(await productStock(ORG, PROD)).toBeCloseTo(0, 6);
  });

  it("blocks increasing sale qty beyond available stock", async () => {
    const sale = await qGet(
      db
        .select()
        .from(sales)
        .where(eq(sales.organizationId, ORG)),
    );
    expect(sale).toBeTruthy();

    const res = await api(`/api/sales/${sale!.id}`, {
      method: "PATCH",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-06-21",
        source: "manufactured",
        itemId: PROD,
        qty: 2,
        unitPrice: 20,
      }),
    });
    expect(res.status).toBe(400);
    expect(await productStock(ORG, PROD)).toBeCloseTo(0, 6);
  });

  it("allows decreasing sale qty and restores stock", async () => {
    const sale = await qGet(
      db
        .select()
        .from(sales)
        .where(eq(sales.organizationId, ORG)),
    );
    expect(sale).toBeTruthy();

    const res = await api(`/api/sales/${sale!.id}`, {
      method: "PATCH",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-06-21",
        source: "manufactured",
        itemId: PROD,
        qty: 0.5,
        unitPrice: 25,
      }),
    });
    expect(res.status).toBe(200);
    expect(await productStock(ORG, PROD)).toBeCloseTo(0.5, 6);

    const updated = await qGet(
      db
        .select()
        .from(sales)
        .where(eq(sales.id, sale!.id)),
    );
    expect(updated?.unitPrice).toBeCloseTo(25, 6);
    expect(updated?.revenue).toBeCloseTo(12.5, 6);
  });

  it("blocks moving a sale before production exists", async () => {
    const sale = await qGet(
      db
        .select()
        .from(sales)
        .where(eq(sales.organizationId, ORG)),
    );
    expect(sale).toBeTruthy();

    const res = await api(`/api/sales/${sale!.id}`, {
      method: "PATCH",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-05-01",
        source: "manufactured",
        itemId: PROD,
        qty: 0.5,
        unitPrice: 25,
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("purchase_timeline");
    expect(await productStock(ORG, PROD)).toBeCloseTo(0.5, 6);
  });

  it("allows deleting a sale and restores stock", async () => {
    const sale = await qGet(
      db
        .select()
        .from(sales)
        .where(eq(sales.organizationId, ORG)),
    );
    expect(sale).toBeTruthy();

    const res = await api(`/api/sales/${sale!.id}`, {
      method: "DELETE",
      userId: USER,
      orgId: ORG,
    });
    expect(res.status).toBe(200);
    expect(await productStock(ORG, PROD)).toBeCloseTo(1, 6);
  });

  it("returns stock and unit cost for a selected item", async () => {
    const made = await api(
      `/api/item-stock?source=manufactured&itemId=${encodeURIComponent(PROD)}`,
      { method: "GET", userId: USER, orgId: ORG },
    );
    expect(made.status).toBe(200);
    const madeBody = (await made.json()) as {
      stock: number;
      unitCost: number;
    };
    expect(madeBody.stock).toBeCloseTo(1, 6);
    expect(madeBody.unitCost).toBeGreaterThan(0);

    const merch = await api(
      `/api/item-stock?source=resale&itemId=${encodeURIComponent(RESALE)}`,
      { method: "GET", userId: USER, orgId: ORG },
    );
    expect(merch.status).toBe(200);
    const merchBody = (await merch.json()) as {
      stock: number;
      unitCost: number;
    };
    expect(merchBody.stock).toBeCloseTo(10, 6);
    expect(merchBody.unitCost).toBeCloseTo(2, 6);
  });

  it("edits a resale sale with stock guards", async () => {
    expect(await resaleStock(ORG, RESALE)).toBeCloseTo(10, 6);

    const create = await api("/api/sales", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-06-21",
        source: "resale",
        itemId: RESALE,
        qty: 4,
        unitPrice: 5,
      }),
    });
    expect(create.status).toBe(201);
    expect(await resaleStock(ORG, RESALE)).toBeCloseTo(6, 6);

    const sale = await qGet(
      db
        .select()
        .from(sales)
        .where(
          and(eq(sales.organizationId, ORG), eq(sales.source, "resale")),
        ),
    );
    expect(sale).toBeTruthy();

    const oversell = await api(`/api/sales/${sale!.id}`, {
      method: "PATCH",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-06-21",
        source: "resale",
        itemId: RESALE,
        qty: 11,
        unitPrice: 5,
      }),
    });
    expect(oversell.status).toBe(400);
    const oversellBody = (await oversell.json()) as {
      error?: string;
      code?: string;
      stock?: string;
    };
    expect(oversellBody.code).toBe("insufficient_stock");
    expect(oversellBody.stock).toBe("10");
    expect(await resaleStock(ORG, RESALE)).toBeCloseTo(6, 6);

    const beforePurchase = await api(`/api/sales/${sale!.id}`, {
      method: "PATCH",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-05-01",
        source: "resale",
        itemId: RESALE,
        qty: 4,
        unitPrice: 5,
      }),
    });
    expect(beforePurchase.status).toBe(400);
    const beforeBody = (await beforePurchase.json()) as { code?: string };
    expect(beforeBody.code).toBe("purchase_timeline");

    const ok = await api(`/api/sales/${sale!.id}`, {
      method: "PATCH",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-06-21",
        source: "resale",
        itemId: RESALE,
        qty: 3,
        unitPrice: 6,
      }),
    });
    expect(ok.status).toBe(200);
    expect(await resaleStock(ORG, RESALE)).toBeCloseTo(7, 6);

    const del = await api(`/api/sales/${sale!.id}`, {
      method: "DELETE",
      userId: USER,
      orgId: ORG,
    });
    expect(del.status).toBe(200);
    expect(await resaleStock(ORG, RESALE)).toBeCloseTo(10, 6);
  });

  it("blocks switching a manufactured sale onto resale without stock timeline", async () => {
    const create = await api("/api/sales", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-06-21",
        source: "manufactured",
        itemId: PROD,
        qty: 1,
        unitPrice: 20,
      }),
    });
    expect(create.status).toBe(201);

    const sale = await qGet(
      db
        .select()
        .from(sales)
        .where(
          and(
            eq(sales.organizationId, ORG),
            eq(sales.source, "manufactured"),
          ),
        ),
    );
    expect(sale).toBeTruthy();

    // Sell all resale stock first, then try switching this sale onto resale.
    await qRun(
      db.insert(sales).values({
        organizationId: ORG,
        date: "2026-06-22",
        source: "resale",
        itemId: RESALE,
        qty: 10,
        unitPrice: 5,
        revenue: 50,
      }),
    );
    expect(await resaleStock(ORG, RESALE)).toBeCloseTo(0, 6);

    const res = await api(`/api/sales/${sale!.id}`, {
      method: "PATCH",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-06-21",
        source: "resale",
        itemId: RESALE,
        qty: 1,
        unitPrice: 5,
      }),
    });
    expect(res.status).toBe(400);
    expect(await productStock(ORG, PROD)).toBeCloseTo(0, 6);
    expect(await resaleStock(ORG, RESALE)).toBeCloseTo(0, 6);

    // Cleanup leftover sales for a clean org state
    await qRun(db.delete(sales).where(eq(sales.organizationId, ORG)));
  });
});

describe("write-off edit/delete consistency", () => {
  it("creates an ingredient write-off and reduces stock", async () => {
    const before = await ingredientStock(ORG, ING);
    expect(before).toBeGreaterThan(2);

    const res = await api("/api/write-offs", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-06-21",
        kind: "Ingredient",
        itemId: ING,
        qty: 2,
        note: "spoiled",
      }),
    });
    expect(res.status).toBe(201);
    expect(await ingredientStock(ORG, ING)).toBeCloseTo(before - 2, 6);
  });

  it("blocks increasing write-off qty beyond available stock", async () => {
    const row = await qGet(
      db
        .select()
        .from(writeOffs)
        .where(eq(writeOffs.organizationId, ORG)),
    );
    expect(row).toBeTruthy();
    const available = (await ingredientStock(ORG, ING)) + Number(row!.qty);

    const res = await api(`/api/write-offs/${row!.id}`, {
      method: "PATCH",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-06-21",
        kind: "Ingredient",
        itemId: ING,
        qty: available + 1,
        note: "spoiled",
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string; code?: string };
    expect(body.code).toBe("insufficient_stock");
  });

  it("blocks moving a write-off before purchases exist", async () => {
    const row = await qGet(
      db
        .select()
        .from(writeOffs)
        .where(eq(writeOffs.organizationId, ORG)),
    );
    expect(row).toBeTruthy();

    const res = await api(`/api/write-offs/${row!.id}`, {
      method: "PATCH",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-05-01",
        kind: "Ingredient",
        itemId: ING,
        qty: 2,
        note: "spoiled",
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("purchase_timeline");
  });

  it("allows decreasing write-off qty and restores stock", async () => {
    const row = await qGet(
      db
        .select()
        .from(writeOffs)
        .where(eq(writeOffs.organizationId, ORG)),
    );
    expect(row).toBeTruthy();
    const before = await ingredientStock(ORG, ING);

    const res = await api(`/api/write-offs/${row!.id}`, {
      method: "PATCH",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-06-21",
        kind: "Ingredient",
        itemId: ING,
        qty: 1,
        note: "partial",
      }),
    });
    expect(res.status).toBe(200);
    expect(await ingredientStock(ORG, ING)).toBeCloseTo(before + 1, 6);
  });

  it("allows deleting a write-off and restores stock", async () => {
    const row = await qGet(
      db
        .select()
        .from(writeOffs)
        .where(eq(writeOffs.organizationId, ORG)),
    );
    expect(row).toBeTruthy();
    const before = await ingredientStock(ORG, ING);

    const res = await api(`/api/write-offs/${row!.id}`, {
      method: "DELETE",
      userId: USER,
      orgId: ORG,
    });
    expect(res.status).toBe(200);
    expect(await ingredientStock(ORG, ING)).toBeCloseTo(
      before + Number(row!.qty),
      6,
    );
  });

  it("edits a manufactured product write-off with stock guards", async () => {
    expect(await productStock(ORG, PROD)).toBeCloseTo(1, 6);

    const create = await api("/api/write-offs", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-06-21",
        kind: "Product",
        itemId: PROD,
        qty: 1,
        note: "broken",
      }),
    });
    expect(create.status).toBe(201);
    expect(await productStock(ORG, PROD)).toBeCloseTo(0, 6);

    const row = await qGet(
      db
        .select()
        .from(writeOffs)
        .where(
          and(
            eq(writeOffs.organizationId, ORG),
            eq(writeOffs.kind, "Product"),
          ),
        ),
    );
    expect(row).toBeTruthy();

    const oversell = await api(`/api/write-offs/${row!.id}`, {
      method: "PATCH",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-06-21",
        kind: "Product",
        itemId: PROD,
        qty: 2,
        note: "broken",
      }),
    });
    expect(oversell.status).toBe(400);

    const beforeProd = await api(`/api/write-offs/${row!.id}`, {
      method: "PATCH",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-05-01",
        kind: "Product",
        itemId: PROD,
        qty: 1,
        note: "broken",
      }),
    });
    expect(beforeProd.status).toBe(400);
    const beforeBody = (await beforeProd.json()) as { code?: string };
    expect(beforeBody.code).toBe("purchase_timeline");

    const del = await api(`/api/write-offs/${row!.id}`, {
      method: "DELETE",
      userId: USER,
      orgId: ORG,
    });
    expect(del.status).toBe(200);
    expect(await productStock(ORG, PROD)).toBeCloseTo(1, 6);
  });

  it("returns ingredient stock from item-stock", async () => {
    const res = await api(
      `/api/item-stock?source=ingredient&itemId=${encodeURIComponent(ING)}`,
      { method: "GET", userId: USER, orgId: ORG },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stock: number; unitCost: number };
    expect(body.stock).toBeCloseTo(await ingredientStock(ORG, ING), 6);
    expect(body.unitCost).toBeCloseTo(5, 6);
  });
});

describe("recipe edit / nullify consistency", () => {
  it("allows editing qty on a used recipe line without changing past stock", async () => {
    const line = await qGet(
      db
        .select()
        .from(recipeLines)
        .where(
          and(
            eq(recipeLines.organizationId, ORG),
            eq(recipeLines.productId, PROD),
            eq(recipeLines.ingredientId, ING),
          ),
        ),
    );
    expect(line).toBeTruthy();

    const stockBefore = await ingredientStock(ORG, ING);
    const costBefore = await recipeUnitCost(ORG, PROD);

    const res = await api(`/api/recipes/${line!.id}`, {
      method: "PATCH",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({ qty: 3 }),
    });
    expect(res.status).toBe(200);
    // Past production snapshots keep stock unchanged.
    expect(await ingredientStock(ORG, ING)).toBeCloseTo(stockBefore, 6);
    // Live composition cost updates for future production.
    expect(await recipeUnitCost(ORG, PROD)).toBeCloseTo(costBefore * 1.5, 6);
  });

  it("blocks deleting a used recipe line but allows nullify", async () => {
    const line = await qGet(
      db
        .select()
        .from(recipeLines)
        .where(
          and(
            eq(recipeLines.organizationId, ORG),
            eq(recipeLines.productId, PROD),
            eq(recipeLines.ingredientId, ING),
          ),
        ),
    );
    expect(line).toBeTruthy();

    const del = await api(`/api/recipes/${line!.id}`, {
      method: "DELETE",
      userId: USER,
      orgId: ORG,
    });
    expect(del.status).toBe(409);
    const delBody = (await del.json()) as { code?: string };
    expect(delBody.code).toBe("recipe_in_use");

    const stockBefore = await ingredientStock(ORG, ING);
    const nullify = await api(`/api/recipes/${line!.id}`, {
      method: "PATCH",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({ qty: 0 }),
    });
    expect(nullify.status).toBe(200);
    expect(await recipeUnitCost(ORG, PROD)).toBeCloseTo(0, 6);
    expect(await ingredientStock(ORG, ING)).toBeCloseTo(stockBefore, 6);

    const list = await api("/api/recipes", {
      method: "GET",
      userId: USER,
      orgId: ORG,
    });
    expect(list.status).toBe(200);
    const rows = (await list.json()) as Array<{
      id: number;
      canDelete?: boolean;
      nullified?: boolean;
      qty: number;
    }>;
    const updated = rows.find((r) => r.id === line!.id);
    expect(updated?.canDelete).toBe(false);
    expect(updated?.nullified).toBe(true);
    expect(updated?.qty).toBe(0);

    // Restore for any later tests / clean mental model
    await api(`/api/recipes/${line!.id}`, {
      method: "PATCH",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({ qty: 2 }),
    });
  });

  it("blocks duplicate recipe lines for the same product+ingredient", async () => {
    const res = await api("/api/recipes", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        productId: PROD,
        ingredientId: ING,
        qty: 1,
      }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("recipe_duplicate");
  });
});
