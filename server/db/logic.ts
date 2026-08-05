import { s } from "./tables.ts";
import { and, eq, gte, lt, sql, desc } from "drizzle-orm";
import { db, qAll, qGet, qRun } from "./index.ts";
const {
  expenses,
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
function orgEq<
  T extends {
    organizationId: unknown;
  },
>(column: T["organizationId"], orgId: string) {
  return eq(column as never, orgId);
}
/** Calendar date in local timezone (YYYY-MM-DD), not UTC. */
export function localDateYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayLocal() {
  return localDateYmd(new Date());
}
/** Excel wsIng col G: SUM(purchase totals) / SUM(qty) for Ingredient. */
export async function avgIngredientCost(
  orgId: string,
  ingredientId: string,
): Promise<number> {
  const row = await qGet(
    db
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
      ),
  );
  if (!row || !row.qty) return 0;
  return row.total / row.qty;
}
/** Live recipe × current ingredient averages (Excel fRecipe / ProductUnitCost). */
export async function recipeUnitCost(
  orgId: string,
  productId: string,
): Promise<number> {
  const lines = await qAll(
    db
      .select()
      .from(recipeLines)
      .where(
        and(
          orgEq(recipeLines.organizationId, orgId),
          eq(recipeLines.productId, productId),
        ),
      ),
  );
  let total = 0;
  for (const line of lines) {
    total += line.qty * (await avgIngredientCost(orgId, line.ingredientId));
  }
  return total;
}
export async function ingredientStock(
  orgId: string,
  ingredientId: string,
): Promise<number> {
  const bought =
    (
      await qGet(
        db
          .select({ q: sql<number>`coalesce(sum(${purchases.qty}), 0)` })
          .from(purchases)
          .where(
            and(
              orgEq(purchases.organizationId, orgId),
              eq(purchases.kind, "Ingredient"),
              eq(purchases.itemId, ingredientId),
            ),
          ),
      )
    )?.q ?? 0;
  const usedInProd = await ingredientUsedInProduction(orgId, ingredientId);
  const written =
    (
      await qGet(
        db
          .select({ q: sql<number>`coalesce(sum(${writeOffs.qty}), 0)` })
          .from(writeOffs)
          .where(
            and(
              orgEq(writeOffs.organizationId, orgId),
              eq(writeOffs.kind, "Ingredient"),
              eq(writeOffs.itemId, ingredientId),
            ),
          ),
      )
    )?.q ?? 0;
  return bought - usedInProd - written;
}

/** Snapshotted usage rows + legacy recipe fallback for runs without snapshots. */
async function ingredientUsedInProduction(
  orgId: string,
  ingredientId: string,
): Promise<number> {
  const fromSnapshot =
    (
      await qGet(
        db
          .select({
            q: sql<number>`coalesce(sum(${productionIngredientUsage.qty}), 0)`,
          })
          .from(productionIngredientUsage)
          .where(
            and(
              orgEq(productionIngredientUsage.organizationId, orgId),
              eq(productionIngredientUsage.ingredientId, ingredientId),
            ),
          ),
      )
    )?.q ?? 0;
  const fromLegacy =
    (
      await qGet(
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
              sql`NOT EXISTS (SELECT 1 FROM production_ingredient_usage u WHERE u.run_id = ${productionRuns.id})`,
            ),
          ),
      )
    )?.q ?? 0;
  return fromSnapshot + fromLegacy;
}

/** One-time/idempotent: snapshot recipe usage for runs created before usage table. */
export async function backfillProductionIngredientUsage() {
  const runs = await qAll(
    db
      .select({
        id: productionRuns.id,
        organizationId: productionRuns.organizationId,
        productId: productionRuns.productId,
        qty: productionRuns.qty,
      })
      .from(productionRuns),
  );
  for (const run of runs) {
    const existing = await qGet(
      db
        .select({ id: productionIngredientUsage.id })
        .from(productionIngredientUsage)
        .where(eq(productionIngredientUsage.runId, run.id))
        .limit(1),
    );
    if (existing) continue;
    const lines = await qAll(
      db
        .select()
        .from(recipeLines)
        .where(
          and(
            orgEq(recipeLines.organizationId, run.organizationId),
            eq(recipeLines.productId, run.productId),
          ),
        ),
    );
    for (const line of lines) {
      await qRun(
        db.insert(productionIngredientUsage).values({
          organizationId: run.organizationId,
          runId: run.id,
          ingredientId: line.ingredientId,
          qty: line.qty * run.qty,
        }),
      );
    }
  }
}
export async function lastPurchaseDate(
  orgId: string,
  ingredientId: string,
): Promise<string | null> {
  const row = await qGet(
    db
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
      .limit(1),
  );
  return row?.d ?? null;
}

export async function lastResalePurchaseDate(
  orgId: string,
  productId: string,
): Promise<string | null> {
  const row = await qGet(
    db
      .select({ d: purchases.date })
      .from(purchases)
      .where(
        and(
          orgEq(purchases.organizationId, orgId),
          eq(purchases.kind, "Product"),
          eq(purchases.itemId, productId),
        ),
      )
      .orderBy(desc(purchases.date))
      .limit(1),
  );
  return row?.d ?? null;
}
export async function productQtyIn(
  orgId: string,
  productId: string,
): Promise<number> {
  return (
    (
      await qGet(
        db
          .select({ q: sql<number>`coalesce(sum(${productionRuns.qty}), 0)` })
          .from(productionRuns)
          .where(
            and(
              orgEq(productionRuns.organizationId, orgId),
              eq(productionRuns.productId, productId),
            ),
          ),
      )
    )?.q ?? 0
  );
}
export async function productStock(
  orgId: string,
  productId: string,
): Promise<number> {
  const made = await productQtyIn(orgId, productId);
  const sold =
    (
      await qGet(
        db
          .select({ q: sql<number>`coalesce(sum(${sales.qty}), 0)` })
          .from(sales)
          .where(
            and(
              orgEq(sales.organizationId, orgId),
              eq(sales.source, "manufactured"),
              eq(sales.itemId, productId),
            ),
          ),
      )
    )?.q ?? 0;
  const written =
    (
      await qGet(
        db
          .select({ q: sql<number>`coalesce(sum(${writeOffs.qty}), 0)` })
          .from(writeOffs)
          .where(
            and(
              orgEq(writeOffs.organizationId, orgId),
              eq(writeOffs.kind, "Product"),
              eq(writeOffs.itemId, productId),
            ),
          ),
      )
    )?.q ?? 0;
  return made - sold - written;
}
export async function resaleStock(
  orgId: string,
  productId: string,
): Promise<number> {
  const bought =
    (
      await qGet(
        db
          .select({ q: sql<number>`coalesce(sum(${purchases.qty}), 0)` })
          .from(purchases)
          .where(
            and(
              orgEq(purchases.organizationId, orgId),
              eq(purchases.kind, "Product"),
              eq(purchases.itemId, productId),
            ),
          ),
      )
    )?.q ?? 0;
  const sold =
    (
      await qGet(
        db
          .select({ q: sql<number>`coalesce(sum(${sales.qty}), 0)` })
          .from(sales)
          .where(
            and(
              orgEq(sales.organizationId, orgId),
              eq(sales.source, "resale"),
              eq(sales.itemId, productId),
            ),
          ),
      )
    )?.q ?? 0;
  const written =
    (
      await qGet(
        db
          .select({ q: sql<number>`coalesce(sum(${writeOffs.qty}), 0)` })
          .from(writeOffs)
          .where(
            and(
              orgEq(writeOffs.organizationId, orgId),
              eq(writeOffs.kind, "Product"),
              eq(writeOffs.itemId, productId),
            ),
          ),
      )
    )?.q ?? 0;
  return bought - sold - written;
}
export async function avgResaleCost(
  orgId: string,
  productId: string,
): Promise<number> {
  const row = await qGet(
    db
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
      ),
  );
  if (!row || !row.qty) return 0;
  return row.total / row.qty;
}
function daysInMonth(isoDate: string): number {
  const d = new Date(isoDate + "T00:00:00");
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
function monthBounds(isoDate: string): {
  start: string;
  end: string;
} {
  const d = new Date(isoDate + "T00:00:00");
  const y = d.getFullYear();
  const m = d.getMonth();
  const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const next = m === 11 ? new Date(y + 1, 0, 1) : new Date(y, m + 1, 1);
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
  return { start, end };
}
/** Excel DailyPoolFormula. */
export async function dailyPool(orgId: string, date: string): Promise<number> {
  const pay =
    (
      await qGet(
        db
          .select({ a: sql<number>`coalesce(sum(${payroll.amount}), 0)` })
          .from(payroll)
          .where(
            and(orgEq(payroll.organizationId, orgId), eq(payroll.date, date)),
          ),
      )
    )?.a ?? 0;
  const other =
    (
      await qGet(
        db
          .select({ a: sql<number>`coalesce(sum(${expenses.gel}), 0)` })
          .from(expenses)
          .where(
            and(
              orgEq(expenses.organizationId, orgId),
              eq(expenses.date, date),
              sql`${expenses.type} NOT IN ('იჯარა', 'ქირა', 'კომუნალური', 'ხელფასი')`,
            ),
          ),
      )
    )?.a ?? 0;
  const { start, end } = monthBounds(date);
  const rentUtil =
    (
      await qGet(
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
          ),
      )
    )?.a ?? 0;
  return pay + other + rentUtil / daysInMonth(date);
}
/** Excel run G = qty × snapshotted F (fallback to live recipe). */
export async function runIngredientTotal(
  orgId: string,
  run: {
    productId: string;
    qty: number;
    ingredientUnitCost?: number | null;
  },
): Promise<number> {
  const unit =
    run.ingredientUnitCost && run.ingredientUnitCost > 0
      ? run.ingredientUnitCost
      : await recipeUnitCost(orgId, run.productId);
  return unit * run.qty;
}
/**
 * Excel: OH for a run = DailyPool(date) * G / SUMIF(same date, G)
 */
export async function runOverheadTotal(
  orgId: string,
  date: string,
  productId: string,
  qty: number,
  runId?: number,
): Promise<number> {
  const pool = await dailyPool(orgId, date);
  const runs = await qAll(
    db
      .select()
      .from(productionRuns)
      .where(
        and(
          orgEq(productionRuns.organizationId, orgId),
          eq(productionRuns.date, date),
        ),
      ),
  );
  let dayG = 0;
  let thisG = 0;
  for (const r of runs) {
    const g = await runIngredientTotal(orgId, r);
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
    thisG = await runIngredientTotal(orgId, {
      productId,
      qty,
      ingredientUnitCost: await recipeUnitCost(orgId, productId),
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

type ProductionRunRow = {
  id: number;
  date: string;
  productId: string;
  qty: number;
  ingredientUnitCost?: number | null;
};

/** Request-scoped cache — P&L must not re-query Neon per sale/run. */
export class PlComputeCache {
  private allRuns: ProductionRunRow[] | null = null;
  private runsByDate = new Map<string, ProductionRunRow[]>();
  private runsByProduct = new Map<string, ProductionRunRow[]>();
  private dailyPools = new Map<string, number>();
  private dayGTotals = new Map<string, number>();
  private recipeUnits = new Map<string, number>();
  private ingredientAvgs = new Map<string, number>();
  private resaleAvgs = new Map<string, number>();
  private productFulls = new Map<string, number>();
  private qtyInMap = new Map<string, number>();
  private payrollRows: Array<{ date: string; amount: number }> | null = null;
  private expenseRows: Array<{ date: string; type: string; gel: number }> | null =
    null;
  private recipeByProduct = new Map<
    string,
    Array<{ ingredientId: string; qty: number }>
  >();
  private purchaseAvgsReady = false;
  private recipeLinesReady = false;

  private orgId: string;

  constructor(orgId: string) {
    this.orgId = orgId;
  }

  async ensureRuns() {
    if (this.allRuns) return;
    this.allRuns = await qAll(
      db
        .select({
          id: productionRuns.id,
          date: productionRuns.date,
          productId: productionRuns.productId,
          qty: productionRuns.qty,
          ingredientUnitCost: productionRuns.ingredientUnitCost,
        })
        .from(productionRuns)
        .where(orgEq(productionRuns.organizationId, this.orgId)),
    );
    for (const run of this.allRuns) {
      const byDate = this.runsByDate.get(run.date) ?? [];
      byDate.push(run);
      this.runsByDate.set(run.date, byDate);
      const byProduct = this.runsByProduct.get(run.productId) ?? [];
      byProduct.push(run);
      this.runsByProduct.set(run.productId, byProduct);
    }
  }

  async recipeUnitCostCached(productId: string) {
    const hit = this.recipeUnits.get(productId);
    if (hit !== undefined) return hit;
    await this.ensureRecipeLines();
    const lines = this.recipeByProduct.get(productId) ?? [];
    let total = 0;
    for (const line of lines) {
      const ingCost = this.ingredientAvgs.get(line.ingredientId);
      total +=
        line.qty *
        (ingCost !== undefined
          ? ingCost
          : await this.avgIngredientCostCached(line.ingredientId));
    }
    this.recipeUnits.set(productId, total);
    return total;
  }

  async avgIngredientCostCached(ingredientId: string) {
    const hit = this.ingredientAvgs.get(ingredientId);
    if (hit !== undefined) return hit;
    const v = await avgIngredientCost(this.orgId, ingredientId);
    this.ingredientAvgs.set(ingredientId, v);
    return v;
  }

  async avgResaleCostCached(resaleId: string) {
    const hit = this.resaleAvgs.get(resaleId);
    if (hit !== undefined) return hit;
    const v = await avgResaleCost(this.orgId, resaleId);
    this.resaleAvgs.set(resaleId, v);
    return v;
  }

  async dailyPoolCached(date: string) {
    const hit = this.dailyPools.get(date);
    if (hit !== undefined) return hit;
    const v = await this.computeDailyPool(date);
    this.dailyPools.set(date, v);
    return v;
  }

  private async ensureOverheadRows() {
    if (this.payrollRows && this.expenseRows) return;
    this.payrollRows = await qAll(
      db
        .select({ date: payroll.date, amount: payroll.amount })
        .from(payroll)
        .where(orgEq(payroll.organizationId, this.orgId)),
    );
    this.expenseRows = await qAll(
      db
        .select({
          date: expenses.date,
          type: expenses.type,
          gel: expenses.gel,
        })
        .from(expenses)
        .where(orgEq(expenses.organizationId, this.orgId)),
    );
  }

  private async computeDailyPool(date: string) {
    await this.ensureOverheadRows();
    const pay = this.payrollRows!.reduce(
      (sum, row) => (row.date === date ? sum + row.amount : sum),
      0,
    );
    const other = this.expenseRows!.reduce(
      (sum, row) =>
        row.date === date &&
        !["იჯარა", "ქირა", "კომუნალური", "ხელფასი"].includes(row.type)
          ? sum + row.gel
          : sum,
      0,
    );
    const { start, end } = monthBounds(date);
    const rentUtil = this.expenseRows!.reduce(
      (sum, row) =>
        row.date >= start &&
        row.date < end &&
        ["იჯარა", "ქირა", "კომუნალური"].includes(row.type)
          ? sum + row.gel
          : sum,
      0,
    );
    return pay + other + rentUtil / daysInMonth(date);
  }

  async runIngredientTotalCached(
    run: {
      productId: string;
      qty: number;
      ingredientUnitCost?: number | null;
    },
  ) {
    const unit =
      run.ingredientUnitCost && run.ingredientUnitCost > 0
        ? run.ingredientUnitCost
        : await this.recipeUnitCostCached(run.productId);
    return unit * run.qty;
  }

  async dayGTotal(date: string) {
    const hit = this.dayGTotals.get(date);
    if (hit !== undefined) return hit;
    await this.ensureRuns();
    const runs = this.runsByDate.get(date) ?? [];
    let total = 0;
    for (const run of runs) {
      total += await this.runIngredientTotalCached(run);
    }
    this.dayGTotals.set(date, total);
    return total;
  }

  async runOverheadTotalCached(run: ProductionRunRow) {
    const pool = await this.dailyPoolCached(run.date);
    const dayG = await this.dayGTotal(run.date);
    const thisG = await this.runIngredientTotalCached(run);
    if (dayG <= 0) return 0;
    return pool * (thisG / dayG);
  }

  async productQtyInCached(productId: string) {
    const hit = this.qtyInMap.get(productId);
    if (hit !== undefined) return hit;
    await this.ensureRuns();
    // Excel qtyIn = total produced (sum of runs), not stock on hand.
    const made = (this.runsByProduct.get(productId) ?? []).reduce(
      (sum, run) => sum + run.qty,
      0,
    );
    this.qtyInMap.set(productId, made);
    return made;
  }

  async productFullUnitCostCached(productId: string) {
    const hit = this.productFulls.get(productId);
    if (hit !== undefined) return hit;
    await this.ensureRuns();
    const qtyIn = await this.productQtyInCached(productId);
    const recipe = await this.recipeUnitCostCached(productId);
    if (qtyIn <= 0) {
      this.productFulls.set(productId, recipe);
      return recipe;
    }
    const runs = this.runsByProduct.get(productId) ?? [];
    let sumI = 0;
    for (const run of runs) {
      sumI +=
        (await this.runIngredientTotalCached(run)) +
        (await this.runOverheadTotalCached(run));
    }
    const v = sumI / qtyIn;
    this.productFulls.set(productId, v);
    return v;
  }

  async writeOffUnitCost(kind: string, itemId: string) {
    if (kind === "Ingredient") return await this.avgIngredientCostCached(itemId);
    const full = await this.productFullUnitCostCached(itemId);
    return full > 0 ? full : await this.avgResaleCostCached(itemId);
  }

  async saleUnitCost(source: string, itemId: string) {
    return source === "resale"
      ? await this.avgResaleCostCached(itemId)
      : await this.productFullUnitCostCached(itemId);
  }

  hasProductionOn(date: string) {
    return (this.runsByDate.get(date)?.length ?? 0) > 0;
  }

  private async ensurePurchaseAvgs() {
    if (this.purchaseAvgsReady) return;
    const ingRows = await qAll(
      db
        .select({
          itemId: purchases.itemId,
          total: sql<number>`coalesce(sum(${purchases.total}), 0)`,
          qty: sql<number>`coalesce(sum(${purchases.qty}), 0)`,
        })
        .from(purchases)
        .where(
          and(
            orgEq(purchases.organizationId, this.orgId),
            eq(purchases.kind, "Ingredient"),
          ),
        )
        .groupBy(purchases.itemId),
    );
    for (const row of ingRows) {
      if (row.qty) this.ingredientAvgs.set(row.itemId, row.total / row.qty);
    }
    const resaleRows = await qAll(
      db
        .select({
          itemId: purchases.itemId,
          total: sql<number>`coalesce(sum(${purchases.total}), 0)`,
          qty: sql<number>`coalesce(sum(${purchases.qty}), 0)`,
        })
        .from(purchases)
        .where(
          and(
            orgEq(purchases.organizationId, this.orgId),
            eq(purchases.kind, "Product"),
          ),
        )
        .groupBy(purchases.itemId),
    );
    for (const row of resaleRows) {
      if (row.qty) this.resaleAvgs.set(row.itemId, row.total / row.qty);
    }
    this.purchaseAvgsReady = true;
  }

  private async ensureRecipeLines() {
    if (this.recipeLinesReady) return;
    await this.ensurePurchaseAvgs();
    const lines = await qAll(
      db
        .select({
          productId: recipeLines.productId,
          ingredientId: recipeLines.ingredientId,
          qty: recipeLines.qty,
        })
        .from(recipeLines)
        .where(orgEq(recipeLines.organizationId, this.orgId)),
    );
    for (const line of lines) {
      const bucket = this.recipeByProduct.get(line.productId) ?? [];
      bucket.push({ ingredientId: line.ingredientId, qty: line.qty });
      this.recipeByProduct.set(line.productId, bucket);
    }
    this.recipeLinesReady = true;
  }

  /** Precompute pools, day totals, and product costs (one pass for all P&L cards). */
  async warm() {
    await this.ensureRuns();
    await this.ensureOverheadRows();
    await this.ensureRecipeLines();
    for (const date of this.runsByDate.keys()) {
      await this.dayGTotal(date);
      await this.dailyPoolCached(date);
    }
    for (const productId of this.runsByProduct.keys()) {
      await this.productFullUnitCostCached(productId);
    }
  }
}

export async function productionIngredientCost(
  orgId: string,
  productId: string,
  qty: number,
): Promise<number> {
  return (await recipeUnitCost(orgId, productId)) * qty;
}
export async function allocateOverheadForRun(
  orgId: string,
  date: string,
  productId: string,
  qty: number,
): Promise<number> {
  return await runOverheadTotal(orgId, date, productId, qty);
}
/** Excel product col E: if qtyIn=0 → recipe; else SUM(run G)/qtyIn */
export async function productIngredientUnitCost(
  orgId: string,
  productId: string,
): Promise<number> {
  const qtyIn = await productQtyIn(orgId, productId);
  const recipe = await recipeUnitCost(orgId, productId);
  if (qtyIn <= 0) return recipe;
  const runs = await qAll(
    db
      .select()
      .from(productionRuns)
      .where(
        and(
          orgEq(productionRuns.organizationId, orgId),
          eq(productionRuns.productId, productId),
        ),
      ),
  );
  let sumG = 0;
  for (const run of runs) sumG += await runIngredientTotal(orgId, run);
  return sumG / qtyIn;
}
/** Excel product col F: SUM(run H)/qtyIn */
export async function productOverheadUnitCost(
  orgId: string,
  productId: string,
): Promise<number> {
  const qtyIn = await productQtyIn(orgId, productId);
  if (qtyIn <= 0) return 0;
  const runs = await qAll(
    db
      .select()
      .from(productionRuns)
      .where(
        and(
          orgEq(productionRuns.organizationId, orgId),
          eq(productionRuns.productId, productId),
        ),
      ),
  );
  let sumH = 0;
  for (const run of runs) {
    sumH += await runOverheadTotal(
      orgId,
      run.date,
      run.productId,
      run.qty,
      run.id,
    );
  }
  return sumH / qtyIn;
}
/** Excel product col H: if qtyIn=0 → recipe; else SUM(run I)/qtyIn where I=G+H */
export async function productFullUnitCost(
  orgId: string,
  productId: string,
): Promise<number> {
  const qtyIn = await productQtyIn(orgId, productId);
  const recipe = await recipeUnitCost(orgId, productId);
  if (qtyIn <= 0) return recipe;
  const runs = await qAll(
    db
      .select()
      .from(productionRuns)
      .where(
        and(
          orgEq(productionRuns.organizationId, orgId),
          eq(productionRuns.productId, productId),
        ),
      ),
  );
  let sumI = 0;
  for (const run of runs) {
    const g = await runIngredientTotal(orgId, run);
    const h = await runOverheadTotal(
      orgId,
      run.date,
      run.productId,
      run.qty,
      run.id,
    );
    sumI += g + h;
  }
  return sumI / qtyIn;
}
export async function plSummary(
  orgId: string,
  from: string,
  to: string,
  cache?: PlComputeCache,
) {
  const c = cache ?? new PlComputeCache(orgId);
  const revenue =
    (
      await qGet(
        db
          .select({ a: sql<number>`coalesce(sum(${sales.revenue}), 0)` })
          .from(sales)
          .where(
            and(
              orgEq(sales.organizationId, orgId),
              gte(sales.date, from),
              lt(sales.date, to),
            ),
          ),
      )
    )?.a ?? 0;
  const saleRows = await qAll(
    db
      .select()
      .from(sales)
      .where(
        and(
          orgEq(sales.organizationId, orgId),
          gte(sales.date, from),
          lt(sales.date, to),
        ),
      ),
  );
  let cogs = 0;
  for (const s of saleRows) {
    cogs += (await c.saleUnitCost(s.source, s.itemId)) * s.qty;
  }
  const woRows = await qAll(
    db
      .select()
      .from(writeOffs)
      .where(
        and(
          orgEq(writeOffs.organizationId, orgId),
          gte(writeOffs.date, from),
          lt(writeOffs.date, to),
        ),
      ),
  );
  let writeOffCost = 0;
  for (const w of woRows) {
    writeOffCost += (await c.writeOffUnitCost(w.kind, w.itemId)) * w.qty;
  }
  let ohTotal = 0;
  let allocated = 0;
  let unallocated = 0;
  for (const date of enumerateDates(from, to)) {
    const pool = await c.dailyPoolCached(date);
    ohTotal += pool;
    if (c.hasProductionOn(date)) allocated += pool;
    else unallocated += pool;
  }
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

/** All dashboard P&L cards — one cache, sequential ranges (fast on Neon). */
export async function plAllSummaries(orgId: string) {
  const ranges = plPeriodRanges();
  const cache = new PlComputeCache(orgId);
  await cache.warm();
  const day = await plSummary(orgId, ranges.day.from, ranges.day.to, cache);
  const week = await plSummary(orgId, ranges.week.from, ranges.week.to, cache);
  const month = await plSummary(orgId, ranges.month.from, ranges.month.to, cache);
  const lastMonth = await plSummary(
    orgId,
    ranges.lastMonth.from,
    ranges.lastMonth.to,
    cache,
  );
  return { day, week, month, lastMonth };
}

export type PlBlock = Awaited<ReturnType<typeof plSummary>>;

export function plPeriodRanges(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const dayStart = localDateYmd(now);
  const dayEnd = localDateYmd(new Date(y, m, d + 1));
  const weekStartDate = new Date(y, m, d - ((now.getDay() + 6) % 7));
  const weekStart = localDateYmd(weekStartDate);
  const weekEnd = localDateYmd(
    new Date(
      weekStartDate.getFullYear(),
      weekStartDate.getMonth(),
      weekStartDate.getDate() + 7,
    ),
  );
  const monthStart = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const monthEnd = localDateYmd(new Date(y, m + 1, 1));
  const lastMonthStart = localDateYmd(new Date(y, m - 1, 1));
  const lastMonthEnd = monthStart;
  return {
    day: { from: dayStart, to: dayEnd },
    week: { from: weekStart, to: weekEnd },
    month: { from: monthStart, to: monthEnd },
    lastMonth: { from: lastMonthStart, to: lastMonthEnd },
  };
}

function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  let cur = from;
  while (cur < to) {
    dates.push(cur);
    const [y, m, d] = cur.split("-").map(Number);
    cur = localDateYmd(new Date(y, m - 1, d + 1));
  }
  return dates;
}

async function plNameMaps(orgId: string) {
  const [prods, resale] = await Promise.all([
    qAll(
      db
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(orgEq(products.organizationId, orgId)),
    ),
    qAll(
      db
        .select({ id: resaleProducts.id, name: resaleProducts.name })
        .from(resaleProducts)
        .where(orgEq(resaleProducts.organizationId, orgId)),
    ),
  ]);
  return {
    productNames: new Map(prods.map((p) => [p.id, p.name])),
    resaleNames: new Map(resale.map((r) => [r.id, r.name])),
  };
}

/** Full P&L drill-down for a date range [from, to) — daily rows, not per-sale lines. */
export async function plDetails(orgId: string, from: string, to: string) {
  const cache = new PlComputeCache(orgId);
  await cache.warm();
  const summary = await plSummary(orgId, from, to, cache);
  const maps = await plNameMaps(orgId);

  const saleRows = await qAll(
    db
      .select()
      .from(sales)
      .where(
        and(
          orgEq(sales.organizationId, orgId),
          gte(sales.date, from),
          lt(sales.date, to),
        ),
      ),
  );

  const woRows = await qAll(
    db
      .select()
      .from(writeOffs)
      .where(
        and(
          orgEq(writeOffs.organizationId, orgId),
          gte(writeOffs.date, from),
          lt(writeOffs.date, to),
        ),
      ),
  );

  const dayMap = new Map<
    string,
    { revenue: number; cogs: number; writeOffCost: number }
  >();
  const salesByDate = new Map<
    string,
    Array<{
      id: number;
      itemName: string;
      source: string;
      qty: number;
      unitPrice: number;
      unitCost: number;
      revenue: number;
      cogs: number;
    }>
  >();

  const touch = (date: string) => {
    let row = dayMap.get(date);
    if (!row) {
      row = { revenue: 0, cogs: 0, writeOffCost: 0 };
      dayMap.set(date, row);
    }
    return row;
  };

  for (const row of saleRows) {
    const unitCost = await cache.saleUnitCost(row.source, row.itemId);
    const acc = touch(row.date);
    acc.revenue += row.revenue;
    acc.cogs += unitCost * row.qty;
    const itemName =
      row.source === "resale"
        ? (maps.resaleNames.get(row.itemId) ?? row.itemId)
        : (maps.productNames.get(row.itemId) ?? row.itemId);
    const daySales = salesByDate.get(row.date) ?? [];
    daySales.push({
      id: row.id,
      itemName,
      source: row.source,
      qty: row.qty,
      unitPrice: row.unitPrice,
      unitCost,
      revenue: row.revenue,
      cogs: unitCost * row.qty,
    });
    salesByDate.set(row.date, daySales);
  }

  for (const w of woRows) {
    const acc = touch(w.date);
    acc.writeOffCost += (await cache.writeOffUnitCost(w.kind, w.itemId)) * w.qty;
  }

  const daily = [];
  for (const date of enumerateDates(from, to)) {
    const acc = dayMap.get(date) ?? {
      revenue: 0,
      cogs: 0,
      writeOffCost: 0,
    };
    const overhead = await cache.dailyPoolCached(date);
    const hasProduction = cache.hasProductionOn(date);
    const allocated = hasProduction ? overhead : 0;
    const unallocated = hasProduction ? 0 : overhead;
    const gross = acc.revenue - acc.cogs;
    const net = gross - acc.writeOffCost - unallocated;
    daily.push({
      date,
      revenue: acc.revenue,
      cogs: acc.cogs,
      gross,
      writeOffCost: acc.writeOffCost,
      overhead,
      allocated,
      unallocated,
      net,
      hasProduction,
      sales: salesByDate.get(date) ?? [],
    });
  }

  return {
    from,
    to,
    summary,
    daily,
  };
}
export function newId(): string {
  return crypto.randomUUID();
}

/** Escape a string for safe use inside RegExp. */
function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Excel-style short prefix for a category.
 * e.g. "რძის ნაწარმი" → "რ" (from existing რ-01…), "ხილ-ბოსტანი" → "ბ".
 * New categories: shortest unique prefix (1→3 chars, then digit suffix)
 * so "newone" and "newww" do not both claim "n".
 */
export function categoryIdPrefix(
  category: string,
  existing: Array<{ id: string; category: string }>,
): string {
  const cat = category.trim();
  if (!cat) return "";

  const counts = new Map<string, number>();
  for (const row of existing) {
    if (row.category.trim() !== cat) continue;
    const m = row.id.match(/^(.+)-(\d+)$/);
    if (!m) continue;
    const prefix = m[1];
    // Excel codes are short (რ, ბ, ხ, მ); skip mistaken full-name IDs
    if ([...prefix].length > 3) continue;
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }
  if (counts.size > 0) {
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  }

  const claimed = new Set<string>();
  for (const row of existing) {
    if (row.category.trim() === cat) continue;
    const m = row.id.match(/^(.+)-(\d+)$/);
    if (!m) continue;
    const prefix = m[1];
    if ([...prefix].length > 3) continue;
    claimed.add(prefix);
  }

  const chars = [...cat];
  for (let len = 1; len <= Math.min(3, chars.length); len++) {
    const candidate = chars.slice(0, len).join("");
    if (!claimed.has(candidate)) return candidate;
  }

  const base =
    chars.slice(0, Math.min(2, chars.length)).join("") || chars[0] || "x";
  for (let n = 2; n <= 9; n++) {
    const candidate = `${base}${n}`;
    if (!claimed.has(candidate)) return candidate;
  }
  return `${base}${Date.now().toString(36).slice(-2)}`;
}

/**
 * Next Excel-style code for a category prefix: `რ-21` if `რ-20` is the highest.
 * Does not reuse gaps (deleted `რ-17` stays unused). Empty prefix → UUID.
 */
export function nextCategoryCode(prefix: string, existingIds: string[]): string {
  const p = prefix.trim();
  if (!p) return newId();
  const re = new RegExp(`^${escapeRegExp(p)}-(\\d+)$`);
  let max = 0;
  let pad = 2;
  for (const id of existingIds) {
    const m = id.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (!Number.isFinite(n)) continue;
    if (n > max) max = n;
    pad = Math.max(pad, m[1].length);
  }
  return `${p}-${String(max + 1).padStart(pad, "0")}`;
}

export { desc, eq, and, orgEq };
