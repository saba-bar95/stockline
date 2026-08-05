import { s } from "./db/tables.ts";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  authMiddleware,
  getOrg,
  renameOrg,
  revokeFreshOAuthLink,
} from "./auth.ts";
import { db, migrate, qAll, qGet, qRun } from "./db/index.ts";
import {
  avgIngredientCost,
  avgResaleCost,
  backfillProductionIngredientUsage,
  ingredientStock,
  lastPurchaseDate,
  lastResalePurchaseDate,
  newId,
  nextCategoryCode,
  categoryIdPrefix,
  plAllSummaries,
  plDetails,
  plPeriodRanges,
  productFullUnitCost,
  productIngredientUnitCost,
  productOverheadUnitCost,
  productQtyIn,
  productStock,
  recipeUnitCost,
  refreshProductionCostsForIngredient,
  validatePurchaseTimeline,
  validateProposedIngredientOut,
  validateProposedManufacturedOut,
  validateProposedResaleOut,
  resaleStock,
  runIngredientTotal,
  runOverheadTotal,
  orgEq,
} from "./db/logic.ts";
import { handleExportCsv, handleExportWorkbook } from "./export.ts";

const {
  employees,
  expenses,
  ingredients,
  payroll,
  productionRuns,
  productionIngredientUsage,
  products,
  purchases,
  recipeLines,
  resaleProducts,
  sales,
  writeOffs,
} = s;

migrate();
void backfillProductionIngredientUsage();
type Vars = {
  Variables: {
    userId: string;
    organizationId: string;
    orgName: string;
  };
};
const app = new Hono<Vars>().basePath("/api");
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return allowedOrigins[0] ?? "";
      return allowedOrigins.includes(origin) ? origin : "";
    },
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);
app.use("*", secureHeaders());
/** Simple in-memory rate limit (per IP). Enough for portfolio; use Redis in heavy prod. */
const hits = new Map<
  string,
  {
    n: number;
    reset: number;
  }
>();
app.use("*", async (c, next) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  let bucket = hits.get(ip);
  if (!bucket || now > bucket.reset) {
    bucket = { n: 0, reset: now + 60000 };
    hits.set(ip, bucket);
  }
  bucket.n += 1;
  if (bucket.n > 120) {
    return c.json({ error: "Too many requests" }, 429);
  }
  return next();
});
app.use("*", authMiddleware);
app.onError((err, c) => {
  console.error(err);
  if (err instanceof z.ZodError) {
    return c.json({ error: "Invalid request" }, 400);
  }
  return c.json({ error: "Something went wrong" }, 500);
});
app.get("/health", (c) => c.json({ ok: true, app: "mise" }));
app.get("/me", (c) =>
  c.json({
    userId: c.get("userId"),
    organizationId: c.get("organizationId"),
    orgName: c.get("orgName"),
  }),
);
/** After Google OAuth: undo auto-link when email was registered with password. */
app.post("/auth/revoke-fresh-oauth", async (c) => {
  const userId = c.get("userId");
  const result = await revokeFreshOAuthLink(userId);
  return c.json(result);
});
app.patch("/me/org", async (c) => {
  const body = z
    .object({ name: z.string().min(1).max(80) })
    .parse(await c.req.json());
  const orgId = getOrg(c);
  await renameOrg(orgId, body.name);
  return c.json({ ok: true, name: body.name.slice(0, 80) });
});
// —— Ingredients ——
async function ingredientHasOps(orgId: string, id: string): Promise<boolean> {
  const purchase = await qGet(
    db
      .select({ id: purchases.id })
      .from(purchases)
      .where(
        and(
          eq(purchases.organizationId, orgId),
          eq(purchases.kind, "Ingredient"),
          eq(purchases.itemId, id),
        ),
      ),
  );
  if (purchase) return true;
  const writeOff = await qGet(
    db
      .select({ id: writeOffs.id })
      .from(writeOffs)
      .where(
        and(
          eq(writeOffs.organizationId, orgId),
          eq(writeOffs.kind, "Ingredient"),
          eq(writeOffs.itemId, id),
        ),
      ),
  );
  if (writeOff) return true;
  const used = await qGet(
    db
      .select({ id: productionIngredientUsage.id })
      .from(productionIngredientUsage)
      .where(
        and(
          eq(productionIngredientUsage.organizationId, orgId),
          eq(productionIngredientUsage.ingredientId, id),
        ),
      ),
  );
  if (used) return true;
  const recipe = await qGet(
    db
      .select({ id: recipeLines.id })
      .from(recipeLines)
      .where(
        and(
          eq(recipeLines.organizationId, orgId),
          eq(recipeLines.ingredientId, id),
        ),
      ),
  );
  return !!recipe;
}
app.get("/ingredients", async (c) => {
  const orgId = getOrg(c);
  const rows = await qAll(
    db
      .select()
      .from(ingredients)
      .where(eq(ingredients.organizationId, orgId))
      .orderBy(ingredients.name),
  );
  return c.json(
    await Promise.all(
      rows.map(async (r) => ({
        ...r,
        avgCost: await avgIngredientCost(orgId, r.id),
        stock: await ingredientStock(orgId, r.id),
        lastPurchaseDate: await lastPurchaseDate(orgId, r.id),
        canDelete: !(await ingredientHasOps(orgId, r.id)),
      })),
    ),
  );
});
app.get("/ingredients/:id/history", async (c) => {
  const orgId = getOrg(c);
  const id = c.req.param("id");
  const ing = await qGet(
    db
      .select()
      .from(ingredients)
      .where(
        and(eq(ingredients.organizationId, orgId), eq(ingredients.id, id)),
      ),
  );
  if (!ing) return c.json({ error: "არ მოიძებნა" }, 404);
  const pur = (
    await qAll(
      db
        .select()
        .from(purchases)
        .where(
          and(
            eq(purchases.organizationId, orgId),
            eq(purchases.kind, "Ingredient"),
            eq(purchases.itemId, id),
          ),
        )
        .orderBy(desc(purchases.date)),
    )
  ).map((p) => ({
    date: p.date,
    type: "შესყიდვა",
    qty: p.qty,
    unitPrice: p.unitPrice,
    total: p.total,
    note: p.note,
  }));
  const prodNames = Object.fromEntries(
    (
      await qAll(
        db.select().from(products).where(eq(products.organizationId, orgId)),
      )
    ).map((p) => [p.id, p.name]),
  );
  const used: Array<{
    date: string;
    type: string;
    qty: number;
    unitPrice: number;
    total: number;
    note: string;
  }> = [];
  const avg = await avgIngredientCost(orgId, id);
  for (const row of await qAll(
    db
      .select({
        date: productionRuns.date,
        qty: productionIngredientUsage.qty,
        productId: productionRuns.productId,
      })
      .from(productionIngredientUsage)
      .innerJoin(
        productionRuns,
        eq(productionIngredientUsage.runId, productionRuns.id),
      )
      .where(
        and(
          orgEq(productionIngredientUsage.organizationId, orgId),
          eq(productionIngredientUsage.ingredientId, id),
        ),
      ),
  )) {
    used.push({
      date: row.date,
      type: "წარმოება",
      qty: -row.qty,
      unitPrice: avg,
      total: -row.qty * avg,
      note: prodNames[row.productId] ?? row.productId,
    });
  }
  for (const run of await qAll(
    db
      .select()
      .from(productionRuns)
      .where(
        and(
          orgEq(productionRuns.organizationId, orgId),
          sql`NOT EXISTS (SELECT 1 FROM production_ingredient_usage u WHERE u.run_id = ${productionRuns.id})`,
        ),
      ),
  )) {
    const line = await qGet(
      db
        .select()
        .from(recipeLines)
        .where(
          and(
            eq(recipeLines.organizationId, orgId),
            eq(recipeLines.productId, run.productId),
            eq(recipeLines.ingredientId, id),
          ),
        ),
    );
    if (!line) continue;
    const usedQty = run.qty * line.qty;
    used.push({
      date: run.date,
      type: "წარმოება",
      qty: -usedQty,
      unitPrice: avg,
      total: -usedQty * avg,
      note: prodNames[run.productId] ?? run.productId,
    });
  }
  const wo = await Promise.all(
    (
      await qAll(
        db
          .select()
          .from(writeOffs)
          .where(
            and(
              eq(writeOffs.organizationId, orgId),
              eq(writeOffs.kind, "Ingredient"),
              eq(writeOffs.itemId, id),
            ),
          )
          .orderBy(desc(writeOffs.date)),
      )
    ).map(async (w) => ({
      date: w.date,
      type: "ჩამოწერა",
      qty: -w.qty,
      unitPrice: await avgIngredientCost(orgId, id),
      total: -w.qty * (await avgIngredientCost(orgId, id)),
      note: w.note,
    })),
  );
  const movements = [...pur, ...used, ...wo].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );
  return c.json({
    ingredient: {
      ...ing,
      avgCost: await avgIngredientCost(orgId, id),
      stock: await ingredientStock(orgId, id),
      lastPurchaseDate: await lastPurchaseDate(orgId, id),
    },
    movements,
  });
});
app.post("/ingredients", async (c) => {
  const orgId = getOrg(c);
  const body = z
    .object({
      name: z.string().min(1),
      unit: z.string().min(1),
      category: z.string().min(1),
    })
    .parse(await c.req.json());
  const category = body.category.trim();
  if (!category) {
    return c.json({ error: "Category is required" }, 400);
  }
  const existing = await qAll(
    db
      .select({ id: ingredients.id, category: ingredients.category })
      .from(ingredients)
      .where(eq(ingredients.organizationId, orgId)),
  );
  // Excel: category "რძის ნაწარმი" → რ-21 (short letter, not full name)
  const prefix = categoryIdPrefix(category, existing);
  const id = nextCategoryCode(
    prefix,
    existing.map((r) => r.id),
  );
  await qRun(
    db.insert(ingredients).values({
      id,
      organizationId: orgId,
      name: body.name,
      unit: body.unit,
      category,
    }),
  );
  return c.json({ id }, 201);
});
app.delete("/ingredients/:id", async (c) => {
  const orgId = getOrg(c);
  const id = c.req.param("id");
  const ing = await qGet(
    db
      .select()
      .from(ingredients)
      .where(
        and(eq(ingredients.organizationId, orgId), eq(ingredients.id, id)),
      ),
  );
  if (!ing) return c.json({ error: "არ მოიძებნა" }, 404);
  if (await ingredientHasOps(orgId, id)) {
    return c.json(
      {
        error:
          "წაშლა შეუძლებელია — ინგრედიენტზე უკვე არის შესყიდვა, რეცეპტი ან ჩამოწერა",
      },
      409,
    );
  }
  await qRun(
    db
      .delete(ingredients)
      .where(
        and(eq(ingredients.organizationId, orgId), eq(ingredients.id, id)),
      ),
  );
  return c.json({ ok: true });
});
// —— Products (manufactured) ——
app.get("/products", async (c) => {
  const orgId = getOrg(c);
  const rows = await qAll(
    db
      .select()
      .from(products)
      .where(eq(products.organizationId, orgId))
      .orderBy(products.name),
  );
  return c.json(
    await Promise.all(
      rows.map(async (r) => {
        const qtyIn = await productQtyIn(orgId, r.id);
        const ingUnit = await productIngredientUnitCost(orgId, r.id);
        const ohUnit = await productOverheadUnitCost(orgId, r.id);
        const fullUnit = await productFullUnitCost(orgId, r.id);
        const stock = await productStock(orgId, r.id);
        return {
          ...r,
          qtyIn,
          unitCost: ingUnit,
          ohUnitCost: ohUnit,
          ohTotal: qtyIn * ohUnit,
          fullUnitCost: fullUnit,
          fullTotal: qtyIn * fullUnit,
          stock,
          stockValue: stock * fullUnit,
          recommendedPrice: fullUnit * 3,
        };
      }),
    ),
  );
});
app.post("/products", async (c) => {
  const orgId = getOrg(c);
  const body = z
    .object({ name: z.string().min(1), unit: z.string().min(1) })
    .parse(await c.req.json());
  const existing = await qAll(
    db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.organizationId, orgId)),
  );
  // Excel-style manufactured product codes: პ-03, პ-04, …
  const id = nextCategoryCode(
    "პ",
    existing.map((r) => r.id),
  );
  await qRun(
    db
      .insert(products)
      .values({ id, organizationId: orgId, name: body.name, unit: body.unit }),
  );
  return c.json({ id }, 201);
});
// —— Resale ——
async function resaleHasOps(orgId: string, id: string): Promise<boolean> {
  const purchase = await qGet(
    db
      .select({ id: purchases.id })
      .from(purchases)
      .where(
        and(
          eq(purchases.organizationId, orgId),
          eq(purchases.kind, "Product"),
          eq(purchases.itemId, id),
        ),
      ),
  );
  if (purchase) return true;
  const sale = await qGet(
    db
      .select({ id: sales.id })
      .from(sales)
      .where(
        and(
          eq(sales.organizationId, orgId),
          eq(sales.source, "resale"),
          eq(sales.itemId, id),
        ),
      ),
  );
  if (sale) return true;
  const writeOff = await qGet(
    db
      .select({ id: writeOffs.id })
      .from(writeOffs)
      .where(
        and(
          eq(writeOffs.organizationId, orgId),
          eq(writeOffs.kind, "Product"),
          eq(writeOffs.itemId, id),
        ),
      ),
  );
  return !!writeOff;
}

app.get("/resale", async (c) => {
  const orgId = getOrg(c);
  const rows = await qAll(
    db
      .select()
      .from(resaleProducts)
      .where(eq(resaleProducts.organizationId, orgId))
      .orderBy(resaleProducts.name),
  );
  return c.json(
    await Promise.all(
      rows.map(async (r) => {
        const unitCost = await avgResaleCost(orgId, r.id);
        const stock = await resaleStock(orgId, r.id);
        return {
          ...r,
          unitCost,
          stock,
          stockValue: stock * unitCost,
          lastPurchaseDate: await lastResalePurchaseDate(orgId, r.id),
          canDelete: !(await resaleHasOps(orgId, r.id)),
        };
      }),
    ),
  );
});
app.get("/resale/:id/history", async (c) => {
  const orgId = getOrg(c);
  const id = c.req.param("id");
  const item = await qGet(
    db
      .select()
      .from(resaleProducts)
      .where(
        and(
          eq(resaleProducts.organizationId, orgId),
          eq(resaleProducts.id, id),
        ),
      ),
  );
  if (!item) return c.json({ error: "არ მოიძებნა" }, 404);
  const avg = await avgResaleCost(orgId, id);
  const pur = (
    await qAll(
      db
        .select()
        .from(purchases)
        .where(
          and(
            eq(purchases.organizationId, orgId),
            eq(purchases.kind, "Product"),
            eq(purchases.itemId, id),
          ),
        )
        .orderBy(desc(purchases.date)),
    )
  ).map((p) => ({
    date: p.date,
    type: "შესყიდვა",
    qty: p.qty,
    unitPrice: p.unitPrice,
    total: p.total,
    note: p.note,
  }));
  const sold = (
    await qAll(
      db
        .select()
        .from(sales)
        .where(
          and(
            eq(sales.organizationId, orgId),
            eq(sales.source, "resale"),
            eq(sales.itemId, id),
          ),
        )
        .orderBy(desc(sales.date)),
    )
  ).map((sRow) => ({
    date: sRow.date,
    type: "გაყიდვა",
    qty: -sRow.qty,
    unitPrice: sRow.unitPrice,
    total: -sRow.revenue,
    note: sRow.note,
  }));
  const wo = (
    await qAll(
      db
        .select()
        .from(writeOffs)
        .where(
          and(
            eq(writeOffs.organizationId, orgId),
            eq(writeOffs.kind, "Product"),
            eq(writeOffs.itemId, id),
          ),
        )
        .orderBy(desc(writeOffs.date)),
    )
  ).map((w) => ({
    date: w.date,
    type: "ჩამოწერა",
    qty: -w.qty,
    unitPrice: avg,
    total: -w.qty * avg,
    note: w.note,
  }));
  const movements = [...pur, ...sold, ...wo].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );
  return c.json({
    item: {
      ...item,
      unitCost: avg,
      stock: await resaleStock(orgId, id),
      lastPurchaseDate: await lastResalePurchaseDate(orgId, id),
    },
    movements,
  });
});
app.post("/resale", async (c) => {
  const orgId = getOrg(c);
  const body = z
    .object({
      name: z.string().min(1),
      unit: z.string().min(1),
      category: z.string().optional(),
    })
    .parse(await c.req.json());
  const category = (body.category ?? "").trim();
  const existing = await qAll(
    db
      .select({ id: resaleProducts.id, category: resaleProducts.category })
      .from(resaleProducts)
      .where(eq(resaleProducts.organizationId, orgId)),
  );
  const prefix = categoryIdPrefix(category, existing);
  const id = nextCategoryCode(
    prefix,
    existing.map((r) => r.id),
  );
  await qRun(
    db.insert(resaleProducts).values({
      id,
      organizationId: orgId,
      name: body.name,
      unit: body.unit,
      category,
    }),
  );
  return c.json({ id }, 201);
});
app.delete("/resale/:id", async (c) => {
  const orgId = getOrg(c);
  const id = c.req.param("id");
  const item = await qGet(
    db
      .select()
      .from(resaleProducts)
      .where(
        and(
          eq(resaleProducts.organizationId, orgId),
          eq(resaleProducts.id, id),
        ),
      ),
  );
  if (!item) return c.json({ error: "არ მოიძებნა" }, 404);
  if (await resaleHasOps(orgId, id)) {
    return c.json(
      {
        error:
          "წაშლა შეუძლებელია — პროდუქტზე უკვე არის შესყიდვა, გაყიდვა ან ჩამოწერა",
      },
      409,
    );
  }
  await qRun(
    db
      .delete(resaleProducts)
      .where(
        and(
          eq(resaleProducts.organizationId, orgId),
          eq(resaleProducts.id, id),
        ),
      ),
  );
  return c.json({ ok: true });
});
// —— Recipes ——
app.get("/recipes", async (c) => {
  const orgId = getOrg(c);
  const lines = await qAll(
    db.select().from(recipeLines).where(eq(recipeLines.organizationId, orgId)),
  );
  const ings = Object.fromEntries(
    (
      await qAll(
        db
          .select()
          .from(ingredients)
          .where(eq(ingredients.organizationId, orgId)),
      )
    ).map((i) => [i.id, i]),
  );
  const prods = Object.fromEntries(
    (
      await qAll(
        db.select().from(products).where(eq(products.organizationId, orgId)),
      )
    ).map((p) => [p.id, p]),
  );
  return c.json(
    lines.map((l) => ({
      ...l,
      productName: prods[l.productId]?.name ?? l.productId,
      ingredientName: ings[l.ingredientId]?.name ?? l.ingredientId,
      unit: ings[l.ingredientId]?.unit ?? "",
    })),
  );
});
app.post("/recipes", async (c) => {
  const orgId = getOrg(c);
  const body = z
    .object({
      productId: z.string(),
      ingredientId: z.string(),
      qty: z.number().positive(),
    })
    .parse(await c.req.json());
  const prod = await qGet(
    db
      .select()
      .from(products)
      .where(
        and(
          eq(products.organizationId, orgId),
          eq(products.id, body.productId),
        ),
      ),
  );
  const ing = await qGet(
    db
      .select()
      .from(ingredients)
      .where(
        and(
          eq(ingredients.organizationId, orgId),
          eq(ingredients.id, body.ingredientId),
        ),
      ),
  );
  if (!prod || !ing)
    return c.json({ error: "Invalid product or ingredient" }, 400);
  await qRun(
    db.insert(recipeLines).values({
      organizationId: orgId,
      productId: body.productId,
      ingredientId: body.ingredientId,
      qty: body.qty,
    }),
  );
  return c.json({ ok: true }, 201);
});
app.delete("/recipes/:id", async (c) => {
  const orgId = getOrg(c);
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "Invalid id" }, 400);
  const line = await qGet(
    db
      .select()
      .from(recipeLines)
      .where(and(eq(recipeLines.organizationId, orgId), eq(recipeLines.id, id))),
  );
  if (!line) return c.json({ error: "არ მოიძებნა" }, 404);
  const produced = await qGet(
    db
      .select({ id: productionRuns.id })
      .from(productionRuns)
      .where(
        and(
          eq(productionRuns.organizationId, orgId),
          eq(productionRuns.productId, line.productId),
        ),
      ),
  );
  if (produced) {
    return c.json(
      {
        error: "recipe_in_use",
        code: "recipe_in_use",
      },
      409,
    );
  }
  await qRun(
    db
      .delete(recipeLines)
      .where(and(eq(recipeLines.organizationId, orgId), eq(recipeLines.id, id))),
  );
  return c.json({ ok: true });
});
async function purchasesForItem(
  orgId: string,
  kind: "Ingredient" | "Product",
  itemId: string,
) {
  return qAll(
    db
      .select({
        id: purchases.id,
        date: purchases.date,
        qty: purchases.qty,
      })
      .from(purchases)
      .where(
        and(
          eq(purchases.organizationId, orgId),
          eq(purchases.kind, kind),
          eq(purchases.itemId, itemId),
        ),
      ),
  );
}

async function timelineErrorForItem(
  orgId: string,
  kind: "Ingredient" | "Product",
  itemId: string,
  rows: Array<{ date: string; qty: number }>,
) {
  const conflict = await validatePurchaseTimeline(orgId, kind, itemId, rows);
  if (!conflict) return null;
  return {
    error: "purchase_timeline",
    code: "purchase_timeline",
    conflictDate: conflict.conflictDate,
    conflictKind: conflict.conflictKind,
  };
}

function timelineJson(conflict: {
  conflictDate: string;
  conflictKind: string;
}) {
  return {
    error: "purchase_timeline",
    code: "purchase_timeline",
    conflictDate: conflict.conflictDate,
    conflictKind: conflict.conflictKind,
  };
}

// —— Purchases ——
app.get("/purchases", async (c) => {
  const orgId = getOrg(c);
  return c.json(
    await qAll(
      db
        .select()
        .from(purchases)
        .where(eq(purchases.organizationId, orgId))
        .orderBy(desc(purchases.date), desc(purchases.id)),
    ),
  );
});
app.post("/purchases", async (c) => {
  const orgId = getOrg(c);
  const body = z
    .object({
      date: z.string(),
      kind: z.enum(["Ingredient", "Product"]),
      itemId: z.string(),
      qty: z.number().positive(),
      unitPrice: z.number().positive(),
      note: z.string().optional(),
    })
    .parse(await c.req.json());
  const total = body.qty * body.unitPrice;
  await qRun(
    db.insert(purchases).values({
      organizationId: orgId,
      date: body.date,
      kind: body.kind,
      itemId: body.itemId,
      qty: body.qty,
      unitPrice: body.unitPrice,
      total,
      note: body.note ?? "",
    }),
  );
  if (body.kind === "Ingredient") {
    await refreshProductionCostsForIngredient(orgId, body.itemId);
  }
  return c.json({ ok: true }, 201);
});
app.patch("/purchases/:id", async (c) => {
  const orgId = getOrg(c);
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "Invalid id" }, 400);
  const body = z
    .object({
      date: z.string(),
      kind: z.enum(["Ingredient", "Product"]),
      itemId: z.string(),
      qty: z.number().positive(),
      unitPrice: z.number().positive(),
      note: z.string().optional(),
    })
    .parse(await c.req.json());
  const existing = await qGet(
    db
      .select()
      .from(purchases)
      .where(and(eq(purchases.organizationId, orgId), eq(purchases.id, id))),
  );
  if (!existing) return c.json({ error: "არ მოიძებნა" }, 404);

  const sameItem =
    existing.kind === body.kind && existing.itemId === body.itemId;
  if (sameItem) {
    const rows = (await purchasesForItem(orgId, body.kind, body.itemId)).map(
      (p) =>
        p.id === id
          ? { date: body.date, qty: body.qty }
          : { date: p.date, qty: p.qty },
    );
    const bad = await timelineErrorForItem(orgId, body.kind, body.itemId, rows);
    if (bad) return c.json(bad, 400);
  } else {
    const oldRows = (await purchasesForItem(
      orgId,
      existing.kind as "Ingredient" | "Product",
      existing.itemId,
    ))
      .filter((p) => p.id !== id)
      .map((p) => ({ date: p.date, qty: p.qty }));
    const oldBad = await timelineErrorForItem(
      orgId,
      existing.kind as "Ingredient" | "Product",
      existing.itemId,
      oldRows,
    );
    if (oldBad) return c.json(oldBad, 400);

    const newRows = [
      ...(await purchasesForItem(orgId, body.kind, body.itemId)).map((p) => ({
        date: p.date,
        qty: p.qty,
      })),
      { date: body.date, qty: body.qty },
    ];
    const newBad = await timelineErrorForItem(
      orgId,
      body.kind,
      body.itemId,
      newRows,
    );
    if (newBad) return c.json(newBad, 400);
  }

  const total = body.qty * body.unitPrice;
  await qRun(
    db
      .update(purchases)
      .set({
        date: body.date,
        kind: body.kind,
        itemId: body.itemId,
        qty: body.qty,
        unitPrice: body.unitPrice,
        total,
        note: body.note ?? "",
      })
      .where(and(eq(purchases.organizationId, orgId), eq(purchases.id, id))),
  );
  const refreshIds = new Set<string>();
  if (existing.kind === "Ingredient") refreshIds.add(existing.itemId);
  if (body.kind === "Ingredient") refreshIds.add(body.itemId);
  for (const ingredientId of refreshIds) {
    await refreshProductionCostsForIngredient(orgId, ingredientId);
  }
  return c.json({ ok: true });
});
app.delete("/purchases/:id", async (c) => {
  const orgId = getOrg(c);
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "Invalid id" }, 400);
  const existing = await qGet(
    db
      .select()
      .from(purchases)
      .where(and(eq(purchases.organizationId, orgId), eq(purchases.id, id))),
  );
  if (!existing) return c.json({ error: "არ მოიძებნა" }, 404);
  const kind = existing.kind as "Ingredient" | "Product";
  const rows = (await purchasesForItem(orgId, kind, existing.itemId))
    .filter((p) => p.id !== id)
    .map((p) => ({ date: p.date, qty: p.qty }));
  const bad = await timelineErrorForItem(orgId, kind, existing.itemId, rows);
  if (bad) return c.json(bad, 400);
  await qRun(
    db
      .delete(purchases)
      .where(and(eq(purchases.organizationId, orgId), eq(purchases.id, id))),
  );
  if (existing.kind === "Ingredient") {
    await refreshProductionCostsForIngredient(orgId, existing.itemId);
  }
  return c.json({ ok: true });
});
// —— Production ——
app.get("/production", async (c) => {
  const orgId = getOrg(c);
  const rows = await qAll(
    db
      .select()
      .from(productionRuns)
      .where(eq(productionRuns.organizationId, orgId))
      .orderBy(desc(productionRuns.date)),
  );
  const names = Object.fromEntries(
    (
      await qAll(
        db.select().from(products).where(eq(products.organizationId, orgId)),
      )
    ).map((p) => [p.id, p.name]),
  );
  return c.json(
    await Promise.all(
      rows.map(async (r) => {
        const unitSnap =
          r.ingredientUnitCost > 0
            ? r.ingredientUnitCost
            : await recipeUnitCost(orgId, r.productId);
        const ingTotal = await runIngredientTotal(orgId, r);
        const ohTotal = await runOverheadTotal(
          orgId,
          r.date,
          r.productId,
          r.qty,
          r.id,
        );
        return {
          ...r,
          productName: names[r.productId] ?? r.productId,
          unitCost: unitSnap,
          ingredientCost: ingTotal,
          overheadCost: ohTotal,
          fullCost: ingTotal + ohTotal,
        };
      }),
    ),
  );
});
app.post("/production", async (c) => {
  const orgId = getOrg(c);
  const body = z
    .object({
      date: z.string(),
      productId: z.string(),
      qty: z.number().positive(),
    })
    .parse(await c.req.json());
  const prod = await qGet(
    db
      .select()
      .from(products)
      .where(
        and(
          eq(products.organizationId, orgId),
          eq(products.id, body.productId),
        ),
      ),
  );
  if (!prod) return c.json({ error: "Product not found" }, 404);
  const lines = await qAll(
    db
      .select()
      .from(recipeLines)
      .where(
        and(
          eq(recipeLines.organizationId, orgId),
          eq(recipeLines.productId, body.productId),
        ),
      ),
  );
  for (const line of lines) {
    const need = line.qty * body.qty;
    const have = await ingredientStock(orgId, line.ingredientId);
    if (have + 1e-9 < need) {
      return c.json(
        {
          error: `არასაკმარისი ნაშთი: ${line.ingredientId} (სჭირდება ${need}, არის ${have})`,
        },
        400,
      );
    }
    const conflict = await validateProposedIngredientOut(
      orgId,
      line.ingredientId,
      {
        date: body.date,
        qty: need,
        conflictKind: "production",
      },
    );
    if (conflict) return c.json(timelineJson(conflict), 400);
  }
  const snap = await recipeUnitCost(orgId, body.productId);
  const run = await qGet(
    db
      .insert(productionRuns)
      .values({
        organizationId: orgId,
        date: body.date,
        productId: body.productId,
        qty: body.qty,
        ingredientUnitCost: snap,
      })
      .returning({ id: productionRuns.id }),
  );
  if (!run) return c.json({ error: "Failed to record production" }, 500);
  for (const line of lines) {
    await qRun(
      db.insert(productionIngredientUsage).values({
        organizationId: orgId,
        runId: run.id,
        ingredientId: line.ingredientId,
        qty: line.qty * body.qty,
      }),
    );
  }
  return c.json({ ok: true }, 201);
});
// —— Sales ——
app.get("/sales", async (c) => {
  const orgId = getOrg(c);
  return c.json(
    await qAll(
      db
        .select()
        .from(sales)
        .where(eq(sales.organizationId, orgId))
        .orderBy(desc(sales.date)),
    ),
  );
});
app.post("/sales", async (c) => {
  const orgId = getOrg(c);
  const body = z
    .object({
      date: z.string(),
      source: z.enum(["manufactured", "resale"]),
      itemId: z.string(),
      qty: z.number().positive(),
      unitPrice: z.number().nonnegative(),
    })
    .parse(await c.req.json());
  const stock =
    body.source === "manufactured"
      ? await productStock(orgId, body.itemId)
      : await resaleStock(orgId, body.itemId);
  if (stock + 1e-9 < body.qty) {
    return c.json({ error: `არასაკმარისი ნაშთი (არის ${stock})` }, 400);
  }
  const conflict =
    body.source === "manufactured"
      ? await validateProposedManufacturedOut(orgId, body.itemId, {
          date: body.date,
          qty: body.qty,
          conflictKind: "sale",
        })
      : await validateProposedResaleOut(orgId, body.itemId, {
          date: body.date,
          qty: body.qty,
          conflictKind: "sale",
        });
  if (conflict) return c.json(timelineJson(conflict), 400);
  await qRun(
    db.insert(sales).values({
      organizationId: orgId,
      date: body.date,
      source: body.source,
      itemId: body.itemId,
      qty: body.qty,
      unitPrice: body.unitPrice,
      revenue: body.qty * body.unitPrice,
    }),
  );
  return c.json({ ok: true }, 201);
});
// —— Write-offs ——
app.get("/write-offs", async (c) => {
  const orgId = getOrg(c);
  return c.json(
    await qAll(
      db
        .select()
        .from(writeOffs)
        .where(eq(writeOffs.organizationId, orgId))
        .orderBy(desc(writeOffs.date)),
    ),
  );
});
app.post("/write-offs", async (c) => {
  const orgId = getOrg(c);
  const body = z
    .object({
      date: z.string(),
      kind: z.enum(["Ingredient", "Product"]),
      itemId: z.string(),
      qty: z.number().positive(),
      note: z.string().optional(),
    })
    .parse(await c.req.json());
  let stock = 0;
  let isManufactured = false;
  if (body.kind === "Ingredient") {
    stock = await ingredientStock(orgId, body.itemId);
  } else {
    const prod = await qGet(
      db
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.organizationId, orgId),
            eq(products.id, body.itemId),
          ),
        ),
    );
    isManufactured = Boolean(prod);
    stock = prod
      ? await productStock(orgId, body.itemId)
      : await resaleStock(orgId, body.itemId);
  }
  if (stock + 1e-9 < body.qty) {
    return c.json({ error: `არასაკმარისი ნაშთი (არის ${stock})` }, 400);
  }
  const conflict =
    body.kind === "Ingredient"
      ? await validateProposedIngredientOut(orgId, body.itemId, {
          date: body.date,
          qty: body.qty,
          conflictKind: "writeOff",
        })
      : isManufactured
        ? await validateProposedManufacturedOut(orgId, body.itemId, {
            date: body.date,
            qty: body.qty,
            conflictKind: "writeOff",
          })
        : await validateProposedResaleOut(orgId, body.itemId, {
            date: body.date,
            qty: body.qty,
            conflictKind: "writeOff",
          });
  if (conflict) return c.json(timelineJson(conflict), 400);
  await qRun(
    db.insert(writeOffs).values({
      organizationId: orgId,
      date: body.date,
      kind: body.kind,
      itemId: body.itemId,
      qty: body.qty,
      note: body.note ?? "",
    }),
  );
  return c.json({ ok: true }, 201);
});
// —— Employees / payroll ——
app.get("/employees", async (c) => {
  const orgId = getOrg(c);
  return c.json(
    await qAll(
      db
        .select()
        .from(employees)
        .where(eq(employees.organizationId, orgId))
        .orderBy(employees.name),
    ),
  );
});
app.post("/employees", async (c) => {
  const orgId = getOrg(c);
  const body = z
    .object({
      name: z.string().min(1),
      dailyRate: z.number().nonnegative(),
      status: z.string().optional(),
    })
    .parse(await c.req.json());
  const id = newId();
  await qRun(
    db.insert(employees).values({
      id,
      organizationId: orgId,
      name: body.name,
      dailyRate: body.dailyRate,
      status: body.status ?? "აქტიური",
    }),
  );
  return c.json({ id }, 201);
});
app.get("/payroll", async (c) => {
  const orgId = getOrg(c);
  return c.json(
    await qAll(
      db
        .select()
        .from(payroll)
        .where(eq(payroll.organizationId, orgId))
        .orderBy(desc(payroll.date)),
    ),
  );
});
app.post("/payroll", async (c) => {
  const orgId = getOrg(c);
  const body = z
    .object({
      date: z.string(),
      employeeId: z.string(),
      amount: z.number().positive(),
    })
    .parse(await c.req.json());
  const emp = await qGet(
    db
      .select()
      .from(employees)
      .where(
        and(
          eq(employees.organizationId, orgId),
          eq(employees.id, body.employeeId),
        ),
      ),
  );
  if (!emp) return c.json({ error: "Employee not found" }, 404);
  await qRun(
    db.insert(payroll).values({
      organizationId: orgId,
      date: body.date,
      employeeId: body.employeeId,
      amount: body.amount,
    }),
  );
  return c.json({ ok: true }, 201);
});
// —— Expenses ——
app.get("/expenses", async (c) => {
  const orgId = getOrg(c);
  return c.json(
    await qAll(
      db
        .select()
        .from(expenses)
        .where(eq(expenses.organizationId, orgId))
        .orderBy(desc(expenses.date)),
    ),
  );
});
app.post("/expenses", async (c) => {
  const orgId = getOrg(c);
  const body = z
    .object({
      date: z.string(),
      type: z.string(),
      name: z.string(),
      gel: z.number().optional(),
      usd: z.number().optional(),
      rate: z.number().optional(),
    })
    .parse(await c.req.json());
  let gel = body.gel ?? 0;
  if ((body.usd ?? 0) > 0 && (body.rate ?? 0) > 0) gel = body.usd! * body.rate!;
  await qRun(
    db.insert(expenses).values({
      organizationId: orgId,
      date: body.date,
      type: body.type,
      name: body.name,
      gel,
      usd: body.usd ?? 0,
      rate: body.rate ?? 0,
    }),
  );
  return c.json({ ok: true }, 201);
});
// —— P&L ——
app.get("/pl/details", async (c) => {
  const orgId = getOrg(c);
  const period = c.req.query("period");
  const ranges = plPeriodRanges();
  const range =
    period === "week"
      ? ranges.week
      : period === "month"
        ? ranges.month
        : period === "lastMonth"
          ? ranges.lastMonth
          : ranges.day;
  return c.json(await plDetails(orgId, range.from, range.to));
});
app.get("/pl", async (c) => {
  const orgId = getOrg(c);
  return c.json(await plAllSummaries(orgId));
});
// —— Exports (org-scoped only) ——
app.get("/export/workbook.xlsx", async (c) => {
  return handleExportWorkbook(c, getOrg(c));
});
app.get("/export/csv/:entity", async (c) => {
  return handleExportCsv(c, getOrg(c), c.req.param("entity"));
});
export { app };
