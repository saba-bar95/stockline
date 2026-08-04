import { and, eq, gte, lt, sql, desc } from "drizzle-orm";
import { db } from "./index.ts";
import {
  expenses,
  payroll,
  productionRuns,
  purchases,
  recipeLines,
  sales,
  writeOffs,
} from "./schema.ts";

function orgEq<T extends { organizationId: unknown }>(
  column: T["organizationId"],
  orgId: string,
) {
  return eq(column as never, orgId);
}

/** Excel wsIng col G: SUM(purchase totals) / SUM(qty) for Ingredient. */
export function avgIngredientCost(orgId: string, ingredientId: string): number {
  const row = db
    .select({
      total: sql<number>`coalesce(sum(${purchases.total}), 0)`,
      qty: sql<number>`coalesce(sum(${purchases.qty}), 0)`,
    })
    .from(purchases)
    .where(
      and(
        orgEq(purchases.organizationId, orgId),
        eq(purchases.kind, "Ingredient"),
        eq(purchases.itemId, ingredientId),
      ),
    )
    .get();
  if (!row || !row.qty) return 0;
  return row.total / row.qty;
}

/** Live recipe × current ingredient averages (Excel fRecipe / ProductUnitCost). */
export function recipeUnitCost(orgId: string, productId: string): number {
  const lines = db
    .select()
    .from(recipeLines)
    .where(
      and(
        orgEq(recipeLines.organizationId, orgId),
        eq(recipeLines.productId, productId),
      ),
    )
    .all();
  return lines.reduce(
    (sum, line) => sum + line.qty * avgIngredientCost(orgId, line.ingredientId),
    0,
  );
}

export function ingredientStock(orgId: string, ingredientId: string): number {
  const bought =
    db
      .select({ q: sql<number>`coalesce(sum(${purchases.qty}), 0)` })
      .from(purchases)
      .where(
        and(
          orgEq(purchases.organizationId, orgId),
          eq(purchases.kind, "Ingredient"),
          eq(purchases.itemId, ingredientId),
        ),
      )
      .get()?.q ?? 0;

  const usedInProd =
    db
      .select({
        q: sql<number>`coalesce(sum(${productionRuns.qty} * ${recipeLines.qty}), 0)`,
      })
      .from(productionRuns)
      .innerJoin(
        recipeLines,
        and(
          eq(recipeLines.productId, productionRuns.productId),
          eq(recipeLines.organizationId, productionRuns.organizationId),
        ),
      )
      .where(
        and(
          orgEq(productionRuns.organizationId, orgId),
          eq(recipeLines.ingredientId, ingredientId),
        ),
      )
      .get()?.q ?? 0;

  const written =
    db
      .select({ q: sql<number>`coalesce(sum(${writeOffs.qty}), 0)` })
      .from(writeOffs)
      .where(
        and(
          orgEq(writeOffs.organizationId, orgId),
          eq(writeOffs.kind, "Ingredient"),
          eq(writeOffs.itemId, ingredientId),
        ),
      )
      .get()?.q ?? 0;

  return bought - usedInProd - written;
}

export function lastPurchaseDate(
  orgId: string,
  ingredientId: string,
): string | null {
  const row = db
    .select({ d: purchases.date })
    .from(purchases)
    .where(
      and(
        orgEq(purchases.organizationId, orgId),
        eq(purchases.kind, "Ingredient"),
        eq(purchases.itemId, ingredientId),
      ),
    )
    .orderBy(desc(purchases.date))
    .limit(1)
    .get();
  return row?.d ?? null;
}

export function productQtyIn(orgId: string, productId: string): number {
  return (
    db
      .select({ q: sql<number>`coalesce(sum(${productionRuns.qty}), 0)` })
      .from(productionRuns)
      .where(
        and(
          orgEq(productionRuns.organizationId, orgId),
          eq(productionRuns.productId, productId),
        ),
      )
      .get()?.q ?? 0
  );
}

export function productStock(orgId: string, productId: string): number {
  const made = productQtyIn(orgId, productId);
  const sold =
    db
      .select({ q: sql<number>`coalesce(sum(${sales.qty}), 0)` })
      .from(sales)
      .where(
        and(
          orgEq(sales.organizationId, orgId),
          eq(sales.source, "manufactured"),
          eq(sales.itemId, productId),
        ),
      )
      .get()?.q ?? 0;
  const written =
    db
      .select({ q: sql<number>`coalesce(sum(${writeOffs.qty}), 0)` })
      .from(writeOffs)
      .where(
        and(
          orgEq(writeOffs.organizationId, orgId),
          eq(writeOffs.kind, "Product"),
          eq(writeOffs.itemId, productId),
        ),
      )
      .get()?.q ?? 0;
  return made - sold - written;
}

export function resaleStock(orgId: string, productId: string): number {
  const bought =
    db
      .select({ q: sql<number>`coalesce(sum(${purchases.qty}), 0)` })
      .from(purchases)
      .where(
        and(
          orgEq(purchases.organizationId, orgId),
          eq(purchases.kind, "Product"),
          eq(purchases.itemId, productId),
        ),
      )
      .get()?.q ?? 0;
  const sold =
    db
      .select({ q: sql<number>`coalesce(sum(${sales.qty}), 0)` })
      .from(sales)
      .where(
        and(
          orgEq(sales.organizationId, orgId),
          eq(sales.source, "resale"),
          eq(sales.itemId, productId),
        ),
      )
      .get()?.q ?? 0;
  const written =
    db
      .select({ q: sql<number>`coalesce(sum(${writeOffs.qty}), 0)` })
      .from(writeOffs)
      .where(
        and(
          orgEq(writeOffs.organizationId, orgId),
          eq(writeOffs.kind, "Product"),
          eq(writeOffs.itemId, productId),
        ),
      )
      .get()?.q ?? 0;
  return bought - sold - written;
}

export function avgResaleCost(orgId: string, productId: string): number {
  const row = db
    .select({
      total: sql<number>`coalesce(sum(${purchases.total}), 0)`,
      qty: sql<number>`coalesce(sum(${purchases.qty}), 0)`,
    })
    .from(purchases)
    .where(
      and(
        orgEq(purchases.organizationId, orgId),
        eq(purchases.kind, "Product"),
        eq(purchases.itemId, productId),
      ),
    )
    .get();
  if (!row || !row.qty) return 0;
  return row.total / row.qty;
}

function daysInMonth(isoDate: string): number {
  const d = new Date(isoDate + "T00:00:00");
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function monthBounds(isoDate: string): { start: string; end: string } {
  const d = new Date(isoDate + "T00:00:00");
  const y = d.getFullYear();
  const m = d.getMonth();
  const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const next = m === 11 ? new Date(y + 1, 0, 1) : new Date(y, m + 1, 1);
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
  return { start, end };
}

/** Excel DailyPoolFormula. */
export function dailyPool(orgId: string, date: string): number {
  const pay =
    db
      .select({ a: sql<number>`coalesce(sum(${payroll.amount}), 0)` })
      .from(payroll)
      .where(and(orgEq(payroll.organizationId, orgId), eq(payroll.date, date)))
      .get()?.a ?? 0;

  const other =
    db
      .select({ a: sql<number>`coalesce(sum(${expenses.gel}), 0)` })
      .from(expenses)
      .where(
        and(
          orgEq(expenses.organizationId, orgId),
          eq(expenses.date, date),
          sql`${expenses.type} NOT IN ('იჯარა', 'ქირა', 'კომუნალური', 'ხელფასი')`,
        ),
      )
      .get()?.a ?? 0;

  const { start, end } = monthBounds(date);
  const rentUtil =
    db
      .select({ a: sql<number>`coalesce(sum(${expenses.gel}), 0)` })
      .from(expenses)
      .where(
        and(
          orgEq(expenses.organizationId, orgId),
          gte(expenses.date, start),
          lt(expenses.date, end),
          sql`${expenses.type} IN ('იჯარა', 'ქირა', 'კომუნალური')`,
        ),
      )
      .get()?.a ?? 0;

  return pay + other + rentUtil / daysInMonth(date);
}

/** Excel run G = qty × snapshotted F (fallback to live recipe). */
export function runIngredientTotal(
  orgId: string,
  run: {
    productId: string;
    qty: number;
    ingredientUnitCost?: number | null;
  },
): number {
  const unit =
    run.ingredientUnitCost && run.ingredientUnitCost > 0
      ? run.ingredientUnitCost
      : recipeUnitCost(orgId, run.productId);
  return unit * run.qty;
}

/**
 * Excel: OH for a run = DailyPool(date) * G / SUMIF(same date, G)
 */
export function runOverheadTotal(
  orgId: string,
  date: string,
  productId: string,
  qty: number,
  runId?: number,
): number {
  const pool = dailyPool(orgId, date);
  const runs = db
    .select()
    .from(productionRuns)
    .where(
      and(
        orgEq(productionRuns.organizationId, orgId),
        eq(productionRuns.date, date),
      ),
    )
    .all();
  let dayG = 0;
  let thisG = 0;
  for (const r of runs) {
    const g = runIngredientTotal(orgId, r);
    dayG += g;
    if (runId != null && r.id === runId) thisG = g;
    else if (
      runId == null &&
      r.productId === productId &&
      Math.abs(r.qty - qty) < 1e-9
    )
      thisG = g;
  }
  if (thisG <= 0) {
    thisG = runIngredientTotal(orgId, {
      productId,
      qty,
      ingredientUnitCost: recipeUnitCost(orgId, productId),
    });
  }
  const existing = runs.some(
    (r) =>
      r.id === runId ||
      (r.productId === productId && Math.abs(r.qty - qty) < 1e-9),
  );
  if (!existing) dayG += thisG;
  if (dayG <= 0) return 0;
  return pool * (thisG / dayG);
}

export function productionIngredientCost(
  orgId: string,
  productId: string,
  qty: number,
): number {
  return recipeUnitCost(orgId, productId) * qty;
}

export function allocateOverheadForRun(
  orgId: string,
  date: string,
  productId: string,
  qty: number,
): number {
  return runOverheadTotal(orgId, date, productId, qty);
}

/** Excel product col E: if qtyIn=0 → recipe; else SUM(run G)/qtyIn */
export function productIngredientUnitCost(
  orgId: string,
  productId: string,
): number {
  const qtyIn = productQtyIn(orgId, productId);
  const recipe = recipeUnitCost(orgId, productId);
  if (qtyIn <= 0) return recipe;
  const runs = db
    .select()
    .from(productionRuns)
    .where(
      and(
        orgEq(productionRuns.organizationId, orgId),
        eq(productionRuns.productId, productId),
      ),
    )
    .all();
  const sumG = runs.reduce((s, r) => s + runIngredientTotal(orgId, r), 0);
  return sumG / qtyIn;
}

/** Excel product col F: SUM(run H)/qtyIn */
export function productOverheadUnitCost(
  orgId: string,
  productId: string,
): number {
  const qtyIn = productQtyIn(orgId, productId);
  if (qtyIn <= 0) return 0;
  const runs = db
    .select()
    .from(productionRuns)
    .where(
      and(
        orgEq(productionRuns.organizationId, orgId),
        eq(productionRuns.productId, productId),
      ),
    )
    .all();
  const sumH = runs.reduce(
    (s, r) => s + runOverheadTotal(orgId, r.date, r.productId, r.qty, r.id),
    0,
  );
  return sumH / qtyIn;
}

/** Excel product col H: if qtyIn=0 → recipe; else SUM(run I)/qtyIn where I=G+H */
export function productFullUnitCost(orgId: string, productId: string): number {
  const qtyIn = productQtyIn(orgId, productId);
  const recipe = recipeUnitCost(orgId, productId);
  if (qtyIn <= 0) return recipe;
  const runs = db
    .select()
    .from(productionRuns)
    .where(
      and(
        orgEq(productionRuns.organizationId, orgId),
        eq(productionRuns.productId, productId),
      ),
    )
    .all();
  const sumI = runs.reduce((s, r) => {
    const g = runIngredientTotal(orgId, r);
    const h = runOverheadTotal(orgId, r.date, r.productId, r.qty, r.id);
    return s + g + h;
  }, 0);
  return sumI / qtyIn;
}

export function plSummary(orgId: string, from: string, to: string) {
  const revenue =
    db
      .select({ a: sql<number>`coalesce(sum(${sales.revenue}), 0)` })
      .from(sales)
      .where(
        and(
          orgEq(sales.organizationId, orgId),
          gte(sales.date, from),
          lt(sales.date, to),
        ),
      )
      .get()?.a ?? 0;

  const saleRows = db
    .select()
    .from(sales)
    .where(
      and(
        orgEq(sales.organizationId, orgId),
        gte(sales.date, from),
        lt(sales.date, to),
      ),
    )
    .all();

  let cogs = 0;
  for (const s of saleRows) {
    if (s.source === "resale") cogs += avgResaleCost(orgId, s.itemId) * s.qty;
    else cogs += productFullUnitCost(orgId, s.itemId) * s.qty;
  }

  const woRows = db
    .select()
    .from(writeOffs)
    .where(
      and(
        orgEq(writeOffs.organizationId, orgId),
        gte(writeOffs.date, from),
        lt(writeOffs.date, to),
      ),
    )
    .all();
  let writeOffCost = 0;
  for (const w of woRows) {
    if (w.kind === "Ingredient")
      writeOffCost += avgIngredientCost(orgId, w.itemId) * w.qty;
    else {
      const full = productFullUnitCost(orgId, w.itemId);
      writeOffCost +=
        (full > 0 ? full : avgResaleCost(orgId, w.itemId)) * w.qty;
    }
  }

  const pay =
    db
      .select({ a: sql<number>`coalesce(sum(${payroll.amount}), 0)` })
      .from(payroll)
      .where(
        and(
          orgEq(payroll.organizationId, orgId),
          gte(payroll.date, from),
          lt(payroll.date, to),
        ),
      )
      .get()?.a ?? 0;

  const oh =
    db
      .select({ a: sql<number>`coalesce(sum(${expenses.gel}), 0)` })
      .from(expenses)
      .where(
        and(
          orgEq(expenses.organizationId, orgId),
          gte(expenses.date, from),
          lt(expenses.date, to),
          sql`${expenses.type} <> 'ხელფასი'`,
        ),
      )
      .get()?.a ?? 0;

  const ohTotal = pay + oh;

  const prodDates = db
    .select({ d: productionRuns.date })
    .from(productionRuns)
    .where(
      and(
        orgEq(productionRuns.organizationId, orgId),
        gte(productionRuns.date, from),
        lt(productionRuns.date, to),
      ),
    )
    .groupBy(productionRuns.date)
    .all();
  let allocated = 0;
  for (const { d } of prodDates) allocated += dailyPool(orgId, d);

  const unallocated = Math.max(0, ohTotal - allocated);
  const gross = revenue - cogs;
  const net = gross - writeOffCost - unallocated;

  return {
    revenue,
    cogs,
    gross,
    writeOffCost,
    ohTotal,
    allocated,
    unallocated,
    net,
  };
}

export function newId(): string {
  return crypto.randomUUID();
}

export { desc, eq, and, orgEq };
