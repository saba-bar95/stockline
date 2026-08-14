import { s } from "./db/tables.ts";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";
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
  formatQty,
  ingredientStock,
  ingredientsListEnriched,
  lastPurchaseDate,
  lastResalePurchaseDate,
  newId,
  nextCategoryCode,
  categoryIdPrefix,
  plAllSummaries,
  plDetails,
  plPeriodRanges,
  productFullUnitCost,
  productQtyIn,
  productStock,
  productsListEnriched,
  productionListEnriched,
  productionRunDetails,
  recipeUnitCost,
  recipeIngredientUsedInProduction,
  refreshProductionCostsForIngredient,
  validatePurchaseTimeline,
  validateProposedIngredientOut,
  validateProposedManufacturedOut,
  validateProposedResaleOut,
  validateProductionRunRemoval,
  validateProductionRunUpdate,
  validateSaleUpdate,
  validateWriteOffUpdate,
  resaleListEnriched,
  resaleStock,
  runIngredientTotal,
  runOverheadTotal,
  orgEq,
} from "./db/logic.ts";
import {
  ERR,
  insufficientStock,
  insufficientStockNeed,
} from "./errors.ts";
import { handleExportCsv, handleExportWorkbook } from "./export.ts";
import {
  allowedOrigins,
  noStoreMiddleware,
  rateLimitMiddleware,
} from "./security.ts";
import { canonicalUnit, sameUnit, storedUnit } from "./units.ts";

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

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
type Vars = {
  Variables: {
    userId: string;
    organizationId: string;
    orgName: string;
  };
};
const app = new Hono<Vars>().basePath("/api");
const origins = allowedOrigins();
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return origins[0] ?? "";
      return origins.includes(origin) ? origin : "";
    },
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 86400,
  }),
);
app.use(
  "*",
  secureHeaders({
    xFrameOptions: "DENY",
    referrerPolicy: "no-referrer",
    permissionsPolicy: {
      camera: false,
      microphone: false,
      geolocation: false,
      payment: false,
    },
  }),
);
app.use("*", noStoreMiddleware);
app.use(
  "*",
  bodyLimit({
    maxSize: 256 * 1024,
    onError: (c) => c.json(ERR.payloadTooLarge, 413),
  }),
);
app.use(
  "*",
  timeout(
    45_000,
    (c) => new HTTPException(504, { res: c.json(ERR.timeout, 504) }),
  ),
);
app.use("*", rateLimitMiddleware);
app.use("*", authMiddleware);
app.onError((err, c) => {
  if (err instanceof z.ZodError) {
    return c.json(ERR.invalidRequest, 400);
  }
  console.error(err);
  return c.json(ERR.serverError, 500);
});
app.get("/health", (c) => c.json({ ok: true, app: "stockline" }));
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

/** Lightweight nav/header counts — COUNT(*) only, no row payloads. */
app.get("/counts", async (c) => {
  const orgId = getOrg(c);
  async function count(
    table:
      | typeof ingredients
      | typeof resaleProducts
      | typeof products
      | typeof purchases
      | typeof productionRuns
      | typeof sales
      | typeof writeOffs
      | typeof employees
      | typeof expenses,
  ) {
    const row = await qGet(
      db
        .select({ n: sql<number>`count(*)` })
        .from(table)
        .where(eq(table.organizationId, orgId)),
    );
    return Number(row?.n ?? 0);
  }
  // Recipes page lists only products that have at least one recipe line.
  const recipesRow = await qGet(
    db
      .select({
        n: sql<number>`count(distinct ${recipeLines.productId})`,
      })
      .from(recipeLines)
      .where(eq(recipeLines.organizationId, orgId)),
  );
  const [
    ingredientsN,
    resaleN,
    productsN,
    purchasesN,
    productionN,
    salesN,
    writeOffsN,
    hrN,
    expensesN,
  ] = await Promise.all([
    count(ingredients),
    count(resaleProducts),
    count(products),
    count(purchases),
    count(productionRuns),
    count(sales),
    count(writeOffs),
    count(employees),
    count(expenses),
  ]);
  return c.json({
    ingredients: ingredientsN,
    resale: resaleN,
    products: productsN,
    recipes: Number(recipesRow?.n ?? 0),
    purchases: purchasesN,
    production: productionN,
    sales: salesN,
    writeOffs: writeOffsN,
    hr: hrN,
    expenses: expensesN,
  });
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

function resolveUnitChange(
  existingUnit: string,
  requested: string,
):
  | { ok: true; unit: string }
  | { ok: false; status: 400; error: string; code: string } {
  const next = storedUnit(requested);
  if (!next) {
    return { ok: false, status: 400, ...ERR.invalidUnit };
  }
  if (sameUnit(existingUnit, next)) {
    return { ok: true, unit: canonicalUnit(next) ?? next };
  }
  if (!canonicalUnit(next)) {
    return { ok: false, status: 400, ...ERR.invalidUnit };
  }
  return { ok: true, unit: next };
}

app.get("/ingredients", async (c) => {
  const orgId = getOrg(c);
  if (c.req.query("minimal") === "1") {
    return c.json(
      await qAll(
        db
          .select({
            id: ingredients.id,
            name: ingredients.name,
            unit: ingredients.unit,
            category: ingredients.category,
          })
          .from(ingredients)
          .where(eq(ingredients.organizationId, orgId))
          .orderBy(ingredients.name),
      ),
    );
  }
  return c.json(await ingredientsListEnriched(orgId));
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
  if (!ing) return c.json(ERR.notFound, 404);
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
      canDelete: !(await ingredientHasOps(orgId, id)),
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
    return c.json(ERR.categoryRequired, 400);
  }
  const unit = canonicalUnit(body.unit);
  if (!unit) {
    return c.json(ERR.invalidUnit, 400);
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
      unit,
      category,
    }),
  );
  return c.json({ id }, 201);
});
app.patch("/ingredients/:id", async (c) => {
  const orgId = getOrg(c);
  const id = c.req.param("id");
  const body = z
    .object({
      name: z.string().min(1),
      unit: z.string().min(1),
      category: z.string().min(1),
    })
    .parse(await c.req.json());
  const category = body.category.trim();
  if (!category) {
    return c.json(ERR.categoryRequired, 400);
  }
  const existing = await qGet(
    db
      .select()
      .from(ingredients)
      .where(
        and(eq(ingredients.organizationId, orgId), eq(ingredients.id, id)),
      ),
  );
  if (!existing) return c.json(ERR.notFound, 404);
  const unit = resolveUnitChange(existing.unit, body.unit);
  if (!unit.ok) {
    return c.json({ error: unit.error, code: unit.code }, unit.status);
  }
  await qRun(
    db
      .update(ingredients)
      .set({
        name: body.name.trim(),
        unit: unit.unit,
        category,
      })
      .where(
        and(eq(ingredients.organizationId, orgId), eq(ingredients.id, id)),
      ),
  );
  return c.json({ ok: true });
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
  if (!ing) return c.json(ERR.notFound, 404);
  if (await ingredientHasOps(orgId, id)) {
    return c.json(ERR.ingredientInUse, 409);
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
  if (c.req.query("minimal") === "1") {
    return c.json(
      await qAll(
        db
          .select({
            id: products.id,
            name: products.name,
            unit: products.unit,
          })
          .from(products)
          .where(eq(products.organizationId, orgId))
          .orderBy(products.name),
      ),
    );
  }
  return c.json(await productsListEnriched(orgId));
});
app.post("/products", async (c) => {
  const orgId = getOrg(c);
  const body = z
    .object({ name: z.string().min(1), unit: z.string().min(1) })
    .parse(await c.req.json());
  const unit = canonicalUnit(body.unit);
  if (!unit) {
    return c.json(ERR.invalidUnit, 400);
  }
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
      .values({ id, organizationId: orgId, name: body.name, unit }),
  );
  return c.json({ id }, 201);
});
app.patch("/products/:id", async (c) => {
  const orgId = getOrg(c);
  const id = c.req.param("id");
  const body = z
    .object({ name: z.string().min(1), unit: z.string().min(1) })
    .parse(await c.req.json());
  const existing = await qGet(
    db
      .select()
      .from(products)
      .where(and(eq(products.organizationId, orgId), eq(products.id, id))),
  );
  if (!existing) return c.json(ERR.notFound, 404);
  const unit = resolveUnitChange(existing.unit, body.unit);
  if (!unit.ok) {
    return c.json({ error: unit.error, code: unit.code }, unit.status);
  }
  await qRun(
    db
      .update(products)
      .set({ name: body.name.trim(), unit: unit.unit })
      .where(and(eq(products.organizationId, orgId), eq(products.id, id))),
  );
  return c.json({ ok: true });
});
async function productHasOps(orgId: string, id: string): Promise<boolean> {
  const run = await qGet(
    db
      .select({ id: productionRuns.id })
      .from(productionRuns)
      .where(
        and(
          eq(productionRuns.organizationId, orgId),
          eq(productionRuns.productId, id),
        ),
      ),
  );
  if (run) return true;
  const sale = await qGet(
    db
      .select({ id: sales.id })
      .from(sales)
      .where(
        and(
          eq(sales.organizationId, orgId),
          eq(sales.source, "manufactured"),
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
app.delete("/products/:id", async (c) => {
  const orgId = getOrg(c);
  const id = c.req.param("id");
  const item = await qGet(
    db
      .select()
      .from(products)
      .where(and(eq(products.organizationId, orgId), eq(products.id, id))),
  );
  if (!item) return c.json(ERR.notFound, 404);
  if (await productHasOps(orgId, id)) {
    return c.json(ERR.productInUse, 409);
  }
  await qRun(
    db
      .delete(recipeLines)
      .where(
        and(
          eq(recipeLines.organizationId, orgId),
          eq(recipeLines.productId, id),
        ),
      ),
  );
  await qRun(
    db
      .delete(products)
      .where(and(eq(products.organizationId, orgId), eq(products.id, id))),
  );
  return c.json({ ok: true });
});
app.get("/products/:id/history", async (c) => {
  const orgId = getOrg(c);
  const id = c.req.param("id");
  const item = await qGet(
    db
      .select()
      .from(products)
      .where(and(eq(products.organizationId, orgId), eq(products.id, id))),
  );
  if (!item) return c.json(ERR.notFound, 404);
  const fullUnit = await productFullUnitCost(orgId, id);
  const stock = await productStock(orgId, id);
  const runs = await qAll(
    db
      .select()
      .from(productionRuns)
      .where(
        and(
          eq(productionRuns.organizationId, orgId),
          eq(productionRuns.productId, id),
        ),
      )
      .orderBy(desc(productionRuns.date)),
  );
  const produced = await Promise.all(
    runs.map(async (run) => {
      const g = await runIngredientTotal(orgId, run);
      const h = await runOverheadTotal(
        orgId,
        run.date,
        run.productId,
        run.qty,
        run.id,
      );
      const unitPrice = run.qty > 0 ? (g + h) / run.qty : 0;
      return {
        date: run.date,
        type: "წარმოება",
        qty: run.qty,
        unitPrice,
        total: g + h,
        note: "",
      };
    }),
  );
  const sold = (
    await qAll(
      db
        .select()
        .from(sales)
        .where(
          and(
            eq(sales.organizationId, orgId),
            eq(sales.source, "manufactured"),
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
    unitPrice: fullUnit,
    total: -w.qty * fullUnit,
    note: w.note,
  }));
  const movements = [...produced, ...sold, ...wo].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );
  return c.json({
    item: {
      ...item,
      fullUnitCost: fullUnit,
      stock,
      qtyIn: await productQtyIn(orgId, id),
      canDelete: !(await productHasOps(orgId, id)),
    },
    movements,
  });
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
  if (c.req.query("minimal") === "1") {
    return c.json(
      await qAll(
        db
          .select({
            id: resaleProducts.id,
            name: resaleProducts.name,
            unit: resaleProducts.unit,
            category: resaleProducts.category,
          })
          .from(resaleProducts)
          .where(eq(resaleProducts.organizationId, orgId))
          .orderBy(resaleProducts.name),
      ),
    );
  }
  return c.json(await resaleListEnriched(orgId));
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
  if (!item) return c.json(ERR.notFound, 404);
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
  if (!item) return c.json(ERR.notFound, 404);
  if (await resaleHasOps(orgId, id)) {
    return c.json(ERR.resaleInUse, 409);
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
  const purchaseStats = await qAll(
    db
      .select({
        itemId: purchases.itemId,
        qty: sql<number>`coalesce(sum(${purchases.qty}), 0)`,
        total: sql<number>`coalesce(sum(${purchases.total}), 0)`,
      })
      .from(purchases)
      .where(
        and(
          eq(purchases.organizationId, orgId),
          eq(purchases.kind, "Ingredient"),
        ),
      )
      .groupBy(purchases.itemId),
  );
  const avgByIng = new Map(
    purchaseStats.map((r) => {
      const qty = Number(r.qty);
      const total = Number(r.total);
      return [r.itemId, qty ? total / qty : 0] as const;
    }),
  );
  return c.json(
    await Promise.all(
      lines.map(async (l) => {
        const avgCost = avgByIng.get(l.ingredientId) ?? 0;
        const inUse = await recipeIngredientUsedInProduction(
          orgId,
          l.productId,
          l.ingredientId,
        );
        return {
          ...l,
          productName: prods[l.productId]?.name ?? l.productId,
          productUnit: prods[l.productId]?.unit ?? "",
          ingredientName: ings[l.ingredientId]?.name ?? l.ingredientId,
          unit: ings[l.ingredientId]?.unit ?? "",
          avgCost,
          lineCost: l.qty * avgCost,
          canDelete: !inUse,
          nullified: Number(l.qty) <= 0,
        };
      }),
    ),
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
    return c.json(ERR.invalidProductOrIngredient, 400);
  const dup = await qGet(
    db
      .select()
      .from(recipeLines)
      .where(
        and(
          eq(recipeLines.organizationId, orgId),
          eq(recipeLines.productId, body.productId),
          eq(recipeLines.ingredientId, body.ingredientId),
        ),
      ),
  );
  if (dup) {
    return c.json(
      { error: "recipe_duplicate", code: "recipe_duplicate" },
      409,
    );
  }
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
app.patch("/recipes/:id", async (c) => {
  const orgId = getOrg(c);
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json(ERR.invalidId, 400);
  const body = z
    .object({
      qty: z.number().nonnegative(),
    })
    .parse(await c.req.json());
  const line = await qGet(
    db
      .select()
      .from(recipeLines)
      .where(and(eq(recipeLines.organizationId, orgId), eq(recipeLines.id, id))),
  );
  if (!line) return c.json(ERR.notFound, 404);

  await qRun(
    db
      .update(recipeLines)
      .set({ qty: body.qty })
      .where(and(eq(recipeLines.organizationId, orgId), eq(recipeLines.id, id))),
  );
  return c.json({ ok: true });
});
app.delete("/recipes/:id", async (c) => {
  const orgId = getOrg(c);
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json(ERR.invalidId, 400);
  const line = await qGet(
    db
      .select()
      .from(recipeLines)
      .where(and(eq(recipeLines.organizationId, orgId), eq(recipeLines.id, id))),
  );
  if (!line) return c.json(ERR.notFound, 404);
  if (
    await recipeIngredientUsedInProduction(
      orgId,
      line.productId,
      line.ingredientId,
    )
  ) {
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
      date: isoDate,
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
  if (!Number.isFinite(id)) return c.json(ERR.invalidId, 400);
  const body = z
    .object({
      date: isoDate,
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
  if (!existing) return c.json(ERR.notFound, 404);

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
  if (!Number.isFinite(id)) return c.json(ERR.invalidId, 400);
  const existing = await qGet(
    db
      .select()
      .from(purchases)
      .where(and(eq(purchases.organizationId, orgId), eq(purchases.id, id))),
  );
  if (!existing) return c.json(ERR.notFound, 404);
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
  return c.json(await productionListEnriched(orgId));
});
app.get("/production/:id", async (c) => {
  const orgId = getOrg(c);
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json(ERR.invalidId, 400);
  const detail = await productionRunDetails(orgId, id);
  if (!detail) return c.json(ERR.notFound, 404);
  return c.json(detail);
});
app.post("/production", async (c) => {
  const orgId = getOrg(c);
  const body = z
    .object({
      date: isoDate,
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
  if (!prod) return c.json(ERR.notFound, 404);
  const lines = (
    await qAll(
      db
        .select()
        .from(recipeLines)
        .where(
          and(
            eq(recipeLines.organizationId, orgId),
            eq(recipeLines.productId, body.productId),
          ),
        ),
    )
  ).filter((line) => Number(line.qty) > 1e-12);
  if (lines.length === 0) {
    return c.json(ERR.noRecipe, 400);
  }
  for (const line of lines) {
    const need = line.qty * body.qty;
    const have = await ingredientStock(orgId, line.ingredientId);
    if (have + 1e-9 < need) {
      return c.json(
        insufficientStockNeed(
          line.ingredientId,
          formatQty(need),
          formatQty(have),
        ),
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
  if (!run) return c.json(ERR.failedProduction, 500);
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
app.patch("/production/:id", async (c) => {
  const orgId = getOrg(c);
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json(ERR.invalidId, 400);
  const body = z
    .object({
      date: isoDate,
      productId: z.string(),
      qty: z.number().positive(),
    })
    .parse(await c.req.json());
  const existing = await qGet(
    db
      .select()
      .from(productionRuns)
      .where(
        and(
          eq(productionRuns.organizationId, orgId),
          eq(productionRuns.id, id),
        ),
      ),
  );
  if (!existing) return c.json(ERR.notFound, 404);

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
  if (!prod) return c.json(ERR.notFound, 404);

  const check = await validateProductionRunUpdate(orgId, id, body);
  if (!check.ok) {
    if (check.conflict) return c.json(timelineJson(check.conflict), 400);
    if (check.stockError) return c.json(check.stockError, 400);
    return c.json(ERR.invalidRequest, 400);
  }

  const lines = (
    await qAll(
      db
        .select()
        .from(recipeLines)
        .where(
          and(
            eq(recipeLines.organizationId, orgId),
            eq(recipeLines.productId, body.productId),
          ),
        ),
    )
  ).filter((line) => Number(line.qty) > 1e-12);
  const snap = await recipeUnitCost(orgId, body.productId);
  await qRun(
    db
      .update(productionRuns)
      .set({
        date: body.date,
        productId: body.productId,
        qty: body.qty,
        ingredientUnitCost: snap,
      })
      .where(
        and(
          eq(productionRuns.organizationId, orgId),
          eq(productionRuns.id, id),
        ),
      ),
  );
  await qRun(
    db
      .delete(productionIngredientUsage)
      .where(
        and(
          eq(productionIngredientUsage.organizationId, orgId),
          eq(productionIngredientUsage.runId, id),
        ),
      ),
  );
  for (const line of lines) {
    await qRun(
      db.insert(productionIngredientUsage).values({
        organizationId: orgId,
        runId: id,
        ingredientId: line.ingredientId,
        qty: line.qty * body.qty,
      }),
    );
  }
  return c.json({ ok: true });
});
app.delete("/production/:id", async (c) => {
  const orgId = getOrg(c);
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json(ERR.invalidId, 400);
  const existing = await qGet(
    db
      .select()
      .from(productionRuns)
      .where(
        and(
          eq(productionRuns.organizationId, orgId),
          eq(productionRuns.id, id),
        ),
      ),
  );
  if (!existing) return c.json(ERR.notFound, 404);

  const conflict = await validateProductionRunRemoval(
    orgId,
    existing.productId,
    id,
  );
  if (conflict) return c.json(timelineJson(conflict), 400);

  await qRun(
    db
      .delete(productionIngredientUsage)
      .where(
        and(
          eq(productionIngredientUsage.organizationId, orgId),
          eq(productionIngredientUsage.runId, id),
        ),
      ),
  );
  await qRun(
    db
      .delete(productionRuns)
      .where(
        and(
          eq(productionRuns.organizationId, orgId),
          eq(productionRuns.id, id),
        ),
      ),
  );
  return c.json({ ok: true });
});
// —— Sales ——
app.get("/item-stock", async (c) => {
  const orgId = getOrg(c);
  const source = c.req.query("source");
  const itemId = c.req.query("itemId");
  if (
    !itemId ||
    (source !== "manufactured" &&
      source !== "resale" &&
      source !== "ingredient")
  ) {
    return c.json(ERR.invalidQuery, 400);
  }
  const [stock, unitCost] = await Promise.all([
    source === "ingredient"
      ? ingredientStock(orgId, itemId)
      : source === "manufactured"
        ? productStock(orgId, itemId)
        : resaleStock(orgId, itemId),
    source === "ingredient"
      ? avgIngredientCost(orgId, itemId)
      : source === "manufactured"
        ? productFullUnitCost(orgId, itemId)
        : avgResaleCost(orgId, itemId),
  ]);
  return c.json({ stock, unitCost });
});
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
      date: isoDate,
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
    return c.json(
      insufficientStock(formatQty(stock)),
      400,
    );
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
app.patch("/sales/:id", async (c) => {
  const orgId = getOrg(c);
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json(ERR.invalidId, 400);
  const body = z
    .object({
      date: isoDate,
      source: z.enum(["manufactured", "resale"]),
      itemId: z.string(),
      qty: z.number().positive(),
      unitPrice: z.number().nonnegative(),
    })
    .parse(await c.req.json());
  const existing = await qGet(
    db
      .select()
      .from(sales)
      .where(and(eq(sales.organizationId, orgId), eq(sales.id, id))),
  );
  if (!existing) return c.json(ERR.notFound, 404);

  const check = await validateSaleUpdate(orgId, id, body);
  if (!check.ok) {
    if (check.conflict) return c.json(timelineJson(check.conflict), 400);
    if (check.stockError) return c.json(check.stockError, 400);
    return c.json(ERR.invalidRequest, 400);
  }

  await qRun(
    db
      .update(sales)
      .set({
        date: body.date,
        source: body.source,
        itemId: body.itemId,
        qty: body.qty,
        unitPrice: body.unitPrice,
        revenue: body.qty * body.unitPrice,
      })
      .where(and(eq(sales.organizationId, orgId), eq(sales.id, id))),
  );
  return c.json({ ok: true });
});
app.delete("/sales/:id", async (c) => {
  const orgId = getOrg(c);
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json(ERR.invalidId, 400);
  const existing = await qGet(
    db
      .select()
      .from(sales)
      .where(and(eq(sales.organizationId, orgId), eq(sales.id, id))),
  );
  if (!existing) return c.json(ERR.notFound, 404);

  await qRun(
    db
      .delete(sales)
      .where(and(eq(sales.organizationId, orgId), eq(sales.id, id))),
  );
  return c.json({ ok: true });
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
      date: isoDate,
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
    return c.json(
      insufficientStock(formatQty(stock)),
      400,
    );
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
app.patch("/write-offs/:id", async (c) => {
  const orgId = getOrg(c);
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json(ERR.invalidId, 400);
  const body = z
    .object({
      date: isoDate,
      kind: z.enum(["Ingredient", "Product"]),
      itemId: z.string(),
      qty: z.number().positive(),
      note: z.string().optional(),
    })
    .parse(await c.req.json());
  const existing = await qGet(
    db
      .select()
      .from(writeOffs)
      .where(and(eq(writeOffs.organizationId, orgId), eq(writeOffs.id, id))),
  );
  if (!existing) return c.json(ERR.notFound, 404);

  const check = await validateWriteOffUpdate(orgId, id, body);
  if (!check.ok) {
    if (check.conflict) return c.json(timelineJson(check.conflict), 400);
    if (check.stockError) return c.json(check.stockError, 400);
    return c.json(ERR.invalidRequest, 400);
  }

  await qRun(
    db
      .update(writeOffs)
      .set({
        date: body.date,
        kind: body.kind,
        itemId: body.itemId,
        qty: body.qty,
        note: body.note ?? "",
      })
      .where(and(eq(writeOffs.organizationId, orgId), eq(writeOffs.id, id))),
  );
  return c.json({ ok: true });
});
app.delete("/write-offs/:id", async (c) => {
  const orgId = getOrg(c);
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json(ERR.invalidId, 400);
  const existing = await qGet(
    db
      .select()
      .from(writeOffs)
      .where(and(eq(writeOffs.organizationId, orgId), eq(writeOffs.id, id))),
  );
  if (!existing) return c.json(ERR.notFound, 404);

  await qRun(
    db
      .delete(writeOffs)
      .where(and(eq(writeOffs.organizationId, orgId), eq(writeOffs.id, id))),
  );
  return c.json({ ok: true });
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
      position: z.string().optional(),
      dailyRate: z.number().nonnegative(),
      status: z.enum(["აქტიური", "არააქტიური"]).optional(),
    })
    .parse(await c.req.json());
  const id = newId();
  await qRun(
    db.insert(employees).values({
      id,
      organizationId: orgId,
      name: body.name.trim(),
      position: body.position?.trim() ?? "",
      dailyRate: body.dailyRate,
      status: body.status ?? "აქტიური",
    }),
  );
  return c.json({ id }, 201);
});
app.patch("/employees/:id", async (c) => {
  const orgId = getOrg(c);
  const id = c.req.param("id");
  const body = z
    .object({
      name: z.string().min(1),
      position: z.string().optional(),
      dailyRate: z.number().nonnegative(),
      status: z.enum(["აქტიური", "არააქტიური"]).optional(),
    })
    .parse(await c.req.json());
  const existing = await qGet(
    db
      .select()
      .from(employees)
      .where(and(eq(employees.organizationId, orgId), eq(employees.id, id))),
  );
  if (!existing) return c.json(ERR.notFound, 404);
  await qRun(
    db
      .update(employees)
      .set({
        name: body.name.trim(),
        position: body.position?.trim() ?? "",
        dailyRate: body.dailyRate,
        status: body.status ?? existing.status,
      })
      .where(and(eq(employees.organizationId, orgId), eq(employees.id, id))),
  );
  return c.json({ ok: true });
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
      date: isoDate,
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
  if (!emp) return c.json(ERR.employeeNotFound, 404);
  if (emp.status !== "აქტიური") return c.json(ERR.employeeInactive, 400);
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
app.patch("/payroll/:id", async (c) => {
  const orgId = getOrg(c);
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json(ERR.invalidId, 400);
  const body = z
    .object({
      date: isoDate,
      employeeId: z.string(),
      amount: z.number().positive(),
    })
    .parse(await c.req.json());
  const existing = await qGet(
    db
      .select()
      .from(payroll)
      .where(and(eq(payroll.organizationId, orgId), eq(payroll.id, id))),
  );
  if (!existing) return c.json(ERR.notFound, 404);
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
  if (!emp) return c.json(ERR.employeeNotFound, 404);
  if (emp.status !== "აქტიური" && existing.employeeId !== body.employeeId) {
    return c.json(ERR.employeeInactive, 400);
  }
  await qRun(
    db
      .update(payroll)
      .set({
        date: body.date,
        employeeId: body.employeeId,
        amount: body.amount,
      })
      .where(and(eq(payroll.organizationId, orgId), eq(payroll.id, id))),
  );
  return c.json({ ok: true });
});
app.delete("/payroll/:id", async (c) => {
  const orgId = getOrg(c);
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json(ERR.invalidId, 400);
  const existing = await qGet(
    db
      .select()
      .from(payroll)
      .where(and(eq(payroll.organizationId, orgId), eq(payroll.id, id))),
  );
  if (!existing) return c.json(ERR.notFound, 404);
  await qRun(
    db
      .delete(payroll)
      .where(and(eq(payroll.organizationId, orgId), eq(payroll.id, id))),
  );
  return c.json({ ok: true });
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
      date: isoDate,
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
