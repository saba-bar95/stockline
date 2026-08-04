import { s } from "./tables.ts";
import { and, eq, gte, lt, sql, desc } from "drizzle-orm";
import { db, qAll, qGet } from "./index.ts";
const { expenses, payroll, productionRuns, purchases, recipeLines, sales, writeOffs } = s;
function orgEq<T extends {
    organizationId: unknown;
}>(column: T["organizationId"], orgId: string) {
    return eq(column as never, orgId);
}
/** Excel wsIng col G: SUM(purchase totals) / SUM(qty) for Ingredient. */
export async function avgIngredientCost(orgId: string, ingredientId: string): Promise<number> {
    const row = await qGet(db
        .select({
        total: sql<number> `coalesce(sum(${purchases.total}), 0)`,
        qty: sql<number> `coalesce(sum(${purchases.qty}), 0)`,
    })
        .from(purchases)
        .where(and(orgEq(purchases.organizationId, orgId), eq(purchases.kind, "Ingredient"), eq(purchases.itemId, ingredientId))));
    if (!row || !row.qty)
        return 0;
    return row.total / row.qty;
}
/** Live recipe × current ingredient averages (Excel fRecipe / ProductUnitCost). */
export async function recipeUnitCost(orgId: string, productId: string): Promise<number> {
    const lines = await qAll(db
        .select()
        .from(recipeLines)
        .where(and(orgEq(recipeLines.organizationId, orgId), eq(recipeLines.productId, productId))));
    let total = 0;
    for (const line of lines) {
        total += line.qty * await avgIngredientCost(orgId, line.ingredientId);
    }
    return total;
}
export async function ingredientStock(orgId: string, ingredientId: string): Promise<number> {
    const bought = (await qGet(db
        .select({ q: sql<number> `coalesce(sum(${purchases.qty}), 0)` })
        .from(purchases)
        .where(and(orgEq(purchases.organizationId, orgId), eq(purchases.kind, "Ingredient"), eq(purchases.itemId, ingredientId)))))?.q ?? 0;
    const usedInProd = (await qGet(db
        .select({
        q: sql<number> `coalesce(sum(${productionRuns.qty} * ${recipeLines.qty}), 0)`,
    })
        .from(productionRuns)
        .innerJoin(recipeLines, and(eq(recipeLines.productId, productionRuns.productId), eq(recipeLines.organizationId, productionRuns.organizationId)))
        .where(and(orgEq(productionRuns.organizationId, orgId), eq(recipeLines.ingredientId, ingredientId)))))?.q ?? 0;
    const written = (await qGet(db
        .select({ q: sql<number> `coalesce(sum(${writeOffs.qty}), 0)` })
        .from(writeOffs)
        .where(and(orgEq(writeOffs.organizationId, orgId), eq(writeOffs.kind, "Ingredient"), eq(writeOffs.itemId, ingredientId)))))?.q ?? 0;
    return bought - usedInProd - written;
}
export async function lastPurchaseDate(orgId: string, ingredientId: string): Promise<string | null> {
    const row = await qGet(db
        .select({ d: purchases.date })
        .from(purchases)
        .where(and(orgEq(purchases.organizationId, orgId), eq(purchases.kind, "Ingredient"), eq(purchases.itemId, ingredientId)))
        .orderBy(desc(purchases.date))
        .limit(1));
    return row?.d ?? null;
}
export async function productQtyIn(orgId: string, productId: string): Promise<number> {
    return ((await qGet(db
        .select({ q: sql<number> `coalesce(sum(${productionRuns.qty}), 0)` })
        .from(productionRuns)
        .where(and(orgEq(productionRuns.organizationId, orgId), eq(productionRuns.productId, productId)))))?.q ?? 0);
}
export async function productStock(orgId: string, productId: string): Promise<number> {
    const made = await productQtyIn(orgId, productId);
    const sold = (await qGet(db
        .select({ q: sql<number> `coalesce(sum(${sales.qty}), 0)` })
        .from(sales)
        .where(and(orgEq(sales.organizationId, orgId), eq(sales.source, "manufactured"), eq(sales.itemId, productId)))))?.q ?? 0;
    const written = (await qGet(db
        .select({ q: sql<number> `coalesce(sum(${writeOffs.qty}), 0)` })
        .from(writeOffs)
        .where(and(orgEq(writeOffs.organizationId, orgId), eq(writeOffs.kind, "Product"), eq(writeOffs.itemId, productId)))))?.q ?? 0;
    return made - sold - written;
}
export async function resaleStock(orgId: string, productId: string): Promise<number> {
    const bought = (await qGet(db
        .select({ q: sql<number> `coalesce(sum(${purchases.qty}), 0)` })
        .from(purchases)
        .where(and(orgEq(purchases.organizationId, orgId), eq(purchases.kind, "Product"), eq(purchases.itemId, productId)))))?.q ?? 0;
    const sold = (await qGet(db
        .select({ q: sql<number> `coalesce(sum(${sales.qty}), 0)` })
        .from(sales)
        .where(and(orgEq(sales.organizationId, orgId), eq(sales.source, "resale"), eq(sales.itemId, productId)))))?.q ?? 0;
    const written = (await qGet(db
        .select({ q: sql<number> `coalesce(sum(${writeOffs.qty}), 0)` })
        .from(writeOffs)
        .where(and(orgEq(writeOffs.organizationId, orgId), eq(writeOffs.kind, "Product"), eq(writeOffs.itemId, productId)))))?.q ?? 0;
    return bought - sold - written;
}
export async function avgResaleCost(orgId: string, productId: string): Promise<number> {
    const row = await qGet(db
        .select({
        total: sql<number> `coalesce(sum(${purchases.total}), 0)`,
        qty: sql<number> `coalesce(sum(${purchases.qty}), 0)`,
    })
        .from(purchases)
        .where(and(orgEq(purchases.organizationId, orgId), eq(purchases.kind, "Product"), eq(purchases.itemId, productId))));
    if (!row || !row.qty)
        return 0;
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
    const pay = (await qGet(db
        .select({ a: sql<number> `coalesce(sum(${payroll.amount}), 0)` })
        .from(payroll)
        .where(and(orgEq(payroll.organizationId, orgId), eq(payroll.date, date)))))?.a ?? 0;
    const other = (await qGet(db
        .select({ a: sql<number> `coalesce(sum(${expenses.gel}), 0)` })
        .from(expenses)
        .where(and(orgEq(expenses.organizationId, orgId), eq(expenses.date, date), sql `${expenses.type} NOT IN ('იჯარა', 'ქირა', 'კომუნალური', 'ხელფასი')`))))?.a ?? 0;
    const { start, end } = monthBounds(date);
    const rentUtil = (await qGet(db
        .select({ a: sql<number> `coalesce(sum(${expenses.gel}), 0)` })
        .from(expenses)
        .where(and(orgEq(expenses.organizationId, orgId), gte(expenses.date, start), lt(expenses.date, end), sql `${expenses.type} IN ('იჯარა', 'ქირა', 'კომუნალური')`))))?.a ?? 0;
    return pay + other + rentUtil / daysInMonth(date);
}
/** Excel run G = qty × snapshotted F (fallback to live recipe). */
export async function runIngredientTotal(orgId: string, run: {
    productId: string;
    qty: number;
    ingredientUnitCost?: number | null;
}): Promise<number> {
    const unit = run.ingredientUnitCost && run.ingredientUnitCost > 0
        ? run.ingredientUnitCost
        : await recipeUnitCost(orgId, run.productId);
    return unit * run.qty;
}
/**
 * Excel: OH for a run = DailyPool(date) * G / SUMIF(same date, G)
 */
export async function runOverheadTotal(orgId: string, date: string, productId: string, qty: number, runId?: number): Promise<number> {
    const pool = await dailyPool(orgId, date);
    const runs = await qAll(db
        .select()
        .from(productionRuns)
        .where(and(orgEq(productionRuns.organizationId, orgId), eq(productionRuns.date, date))));
    let dayG = 0;
    let thisG = 0;
    for (const r of runs) {
        const g = await runIngredientTotal(orgId, r);
        dayG += g;
        if (runId != null && r.id === runId)
            thisG = g;
        else if (runId == null &&
            r.productId === productId &&
            Math.abs(r.qty - qty) < 1e-9)
            thisG = g;
    }
    if (thisG <= 0) {
        thisG = await runIngredientTotal(orgId, {
            productId,
            qty,
            ingredientUnitCost: await recipeUnitCost(orgId, productId),
        });
    }
    const existing = runs.some((r) => r.id === runId ||
        (r.productId === productId && Math.abs(r.qty - qty) < 1e-9));
    if (!existing)
        dayG += thisG;
    if (dayG <= 0)
        return 0;
    return pool * (thisG / dayG);
}
export async function productionIngredientCost(orgId: string, productId: string, qty: number): Promise<number> {
    return await recipeUnitCost(orgId, productId) * qty;
}
export async function allocateOverheadForRun(orgId: string, date: string, productId: string, qty: number): Promise<number> {
    return await runOverheadTotal(orgId, date, productId, qty);
}
/** Excel product col E: if qtyIn=0 → recipe; else SUM(run G)/qtyIn */
export async function productIngredientUnitCost(orgId: string, productId: string): Promise<number> {
    const qtyIn = await productQtyIn(orgId, productId);
    const recipe = await recipeUnitCost(orgId, productId);
    if (qtyIn <= 0)
        return recipe;
    const runs = await qAll(db
        .select()
        .from(productionRuns)
        .where(and(orgEq(productionRuns.organizationId, orgId), eq(productionRuns.productId, productId))));
    let sumG = 0;
    for (const run of runs) sumG += await runIngredientTotal(orgId, run);
    return sumG / qtyIn;
}
/** Excel product col F: SUM(run H)/qtyIn */
export async function productOverheadUnitCost(orgId: string, productId: string): Promise<number> {
    const qtyIn = await productQtyIn(orgId, productId);
    if (qtyIn <= 0)
        return 0;
    const runs = await qAll(db
        .select()
        .from(productionRuns)
        .where(and(orgEq(productionRuns.organizationId, orgId), eq(productionRuns.productId, productId))));
    let sumH = 0;
    for (const run of runs) {
        sumH += await runOverheadTotal(orgId, run.date, run.productId, run.qty, run.id);
    }
    return sumH / qtyIn;
}
/** Excel product col H: if qtyIn=0 → recipe; else SUM(run I)/qtyIn where I=G+H */
export async function productFullUnitCost(orgId: string, productId: string): Promise<number> {
    const qtyIn = await productQtyIn(orgId, productId);
    const recipe = await recipeUnitCost(orgId, productId);
    if (qtyIn <= 0)
        return recipe;
    const runs = await qAll(db
        .select()
        .from(productionRuns)
        .where(and(orgEq(productionRuns.organizationId, orgId), eq(productionRuns.productId, productId))));
    let sumI = 0;
    for (const run of runs) {
        const g = await runIngredientTotal(orgId, run);
        const h = await runOverheadTotal(orgId, run.date, run.productId, run.qty, run.id);
        sumI += g + h;
    }
    return sumI / qtyIn;
}
export async function plSummary(orgId: string, from: string, to: string) {
    const revenue = (await qGet(db
        .select({ a: sql<number> `coalesce(sum(${sales.revenue}), 0)` })
        .from(sales)
        .where(and(orgEq(sales.organizationId, orgId), gte(sales.date, from), lt(sales.date, to)))))?.a ?? 0;
    const saleRows = await qAll(db
        .select()
        .from(sales)
        .where(and(orgEq(sales.organizationId, orgId), gte(sales.date, from), lt(sales.date, to))));
    let cogs = 0;
    for (const s of saleRows) {
        if (s.source === "resale")
            cogs += await avgResaleCost(orgId, s.itemId) * s.qty;
        else
            cogs += await productFullUnitCost(orgId, s.itemId) * s.qty;
    }
    const woRows = await qAll(db
        .select()
        .from(writeOffs)
        .where(and(orgEq(writeOffs.organizationId, orgId), gte(writeOffs.date, from), lt(writeOffs.date, to))));
    let writeOffCost = 0;
    for (const w of woRows) {
        if (w.kind === "Ingredient")
            writeOffCost += await avgIngredientCost(orgId, w.itemId) * w.qty;
        else {
            const full = await productFullUnitCost(orgId, w.itemId);
            writeOffCost +=
                (full > 0 ? full : await avgResaleCost(orgId, w.itemId)) * w.qty;
        }
    }
    const pay = (await qGet(db
        .select({ a: sql<number> `coalesce(sum(${payroll.amount}), 0)` })
        .from(payroll)
        .where(and(orgEq(payroll.organizationId, orgId), gte(payroll.date, from), lt(payroll.date, to)))))?.a ?? 0;
    const oh = (await qGet(db
        .select({ a: sql<number> `coalesce(sum(${expenses.gel}), 0)` })
        .from(expenses)
        .where(and(orgEq(expenses.organizationId, orgId), gte(expenses.date, from), lt(expenses.date, to), sql `${expenses.type} <> 'ხელფასი'`))))?.a ?? 0;
    const ohTotal = pay + oh;
    const prodDates = await qAll(db
        .select({ d: productionRuns.date })
        .from(productionRuns)
        .where(and(orgEq(productionRuns.organizationId, orgId), gte(productionRuns.date, from), lt(productionRuns.date, to)))
        .groupBy(productionRuns.date));
    let allocated = 0;
    for (const { d } of prodDates)
        allocated += await dailyPool(orgId, d);
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
