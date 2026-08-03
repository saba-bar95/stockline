import { and, eq, gte, lt, sql, desc } from 'drizzle-orm'
import { db } from './index.ts'
import {
  expenses,
  ingredients,
  payroll,
  productionRuns,
  purchases,
  recipeLines,
  sales,
  writeOffs,
} from './schema.ts'

export function avgIngredientCost(ingredientId: string): number {
  const row = db
    .select({
      total: sql<number>`coalesce(sum(${purchases.total}), 0)`,
      qty: sql<number>`coalesce(sum(${purchases.qty}), 0)`,
    })
    .from(purchases)
    .where(and(eq(purchases.kind, 'Ingredient'), eq(purchases.itemId, ingredientId)))
    .get()
  if (!row || !row.qty) return 0
  return row.total / row.qty
}

export function recipeUnitCost(productId: string): number {
  const lines = db.select().from(recipeLines).where(eq(recipeLines.productId, productId)).all()
  return lines.reduce((sum, line) => sum + line.qty * avgIngredientCost(line.ingredientId), 0)
}

export function ingredientStock(ingredientId: string): number {
  const bought =
    db
      .select({ q: sql<number>`coalesce(sum(${purchases.qty}), 0)` })
      .from(purchases)
      .where(and(eq(purchases.kind, 'Ingredient'), eq(purchases.itemId, ingredientId)))
      .get()?.q ?? 0

  const usedInProd = db
    .select({
      q: sql<number>`coalesce(sum(${productionRuns.qty} * ${recipeLines.qty}), 0)`,
    })
    .from(productionRuns)
    .innerJoin(recipeLines, eq(recipeLines.productId, productionRuns.productId))
    .where(eq(recipeLines.ingredientId, ingredientId))
    .get()?.q ?? 0

  const written =
    db
      .select({ q: sql<number>`coalesce(sum(${writeOffs.qty}), 0)` })
      .from(writeOffs)
      .where(and(eq(writeOffs.kind, 'Ingredient'), eq(writeOffs.itemId, ingredientId)))
      .get()?.q ?? 0

  return bought - usedInProd - written
}

export function productStock(productId: string): number {
  const made =
    db
      .select({ q: sql<number>`coalesce(sum(${productionRuns.qty}), 0)` })
      .from(productionRuns)
      .where(eq(productionRuns.productId, productId))
      .get()?.q ?? 0
  const sold =
    db
      .select({ q: sql<number>`coalesce(sum(${sales.qty}), 0)` })
      .from(sales)
      .where(and(eq(sales.source, 'manufactured'), eq(sales.itemId, productId)))
      .get()?.q ?? 0
  const written =
    db
      .select({ q: sql<number>`coalesce(sum(${writeOffs.qty}), 0)` })
      .from(writeOffs)
      .where(and(eq(writeOffs.kind, 'Product'), eq(writeOffs.itemId, productId)))
      .get()?.q ?? 0
  return made - sold - written
}

export function resaleStock(productId: string): number {
  const bought =
    db
      .select({ q: sql<number>`coalesce(sum(${purchases.qty}), 0)` })
      .from(purchases)
      .where(and(eq(purchases.kind, 'Product'), eq(purchases.itemId, productId)))
      .get()?.q ?? 0
  const sold =
    db
      .select({ q: sql<number>`coalesce(sum(${sales.qty}), 0)` })
      .from(sales)
      .where(and(eq(sales.source, 'resale'), eq(sales.itemId, productId)))
      .get()?.q ?? 0
  const written =
    db
      .select({ q: sql<number>`coalesce(sum(${writeOffs.qty}), 0)` })
      .from(writeOffs)
      .where(and(eq(writeOffs.kind, 'Product'), eq(writeOffs.itemId, productId)))
      .get()?.q ?? 0
  return bought - sold - written
}

export function avgResaleCost(productId: string): number {
  const row = db
    .select({
      total: sql<number>`coalesce(sum(${purchases.total}), 0)`,
      qty: sql<number>`coalesce(sum(${purchases.qty}), 0)`,
    })
    .from(purchases)
    .where(and(eq(purchases.kind, 'Product'), eq(purchases.itemId, productId)))
    .get()
  if (!row || !row.qty) return 0
  return row.total / row.qty
}

function daysInMonth(isoDate: string): number {
  const d = new Date(isoDate + 'T00:00:00')
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

function monthBounds(isoDate: string): { start: string; end: string } {
  const d = new Date(isoDate + 'T00:00:00')
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  const endDate = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  const end = endDate.toISOString().slice(0, 10)
  return { start, end }
}

/** Daily overhead pool for a production date (Excel DailyPoolFormula). */
export function dailyPool(date: string): number {
  const pay =
    db
      .select({ a: sql<number>`coalesce(sum(${payroll.amount}), 0)` })
      .from(payroll)
      .where(eq(payroll.date, date))
      .get()?.a ?? 0

  const other =
    db
      .select({ a: sql<number>`coalesce(sum(${expenses.gel}), 0)` })
      .from(expenses)
      .where(
        and(
          eq(expenses.date, date),
          sql`${expenses.type} NOT IN ('იჯარა', 'ქირა', 'კომუნალური')`,
        ),
      )
      .get()?.a ?? 0

  const { start, end } = monthBounds(date)
  const rentUtil =
    db
      .select({ a: sql<number>`coalesce(sum(${expenses.gel}), 0)` })
      .from(expenses)
      .where(
        and(
          gte(expenses.date, start),
          lt(expenses.date, end),
          sql`${expenses.type} IN ('იჯარა', 'ქირა', 'კომუნალური')`,
        ),
      )
      .get()?.a ?? 0

  return pay + other + rentUtil / daysInMonth(date)
}

export function productionIngredientCost(productId: string, qty: number): number {
  return recipeUnitCost(productId) * qty
}

/** Allocate day's OH pool across runs by ingredient cost weight. */
export function allocateOverheadForRun(date: string, productId: string, qty: number): number {
  const pool = dailyPool(date)
  const runs = db.select().from(productionRuns).where(eq(productionRuns.date, date)).all()
  let dayIngTotal = 0
  const weights: { id: string; productId: string; qty: number; w: number }[] = []
  for (const run of runs) {
    const w = productionIngredientCost(run.productId, run.qty)
    weights.push({ id: String(run.id), productId: run.productId, qty: run.qty, w })
    dayIngTotal += w
  }
  // include hypothetical current run if not yet saved — caller passes existing
  if (dayIngTotal <= 0) return 0
  const thisW = productionIngredientCost(productId, qty)
  return pool * (thisW / dayIngTotal)
}

export function plSummary(from: string, to: string) {
  const revenue =
    db
      .select({ a: sql<number>`coalesce(sum(${sales.revenue}), 0)` })
      .from(sales)
      .where(and(gte(sales.date, from), lt(sales.date, to)))
      .get()?.a ?? 0

  const saleRows = db
    .select()
    .from(sales)
    .where(and(gte(sales.date, from), lt(sales.date, to)))
    .all()

  let cogs = 0
  for (const s of saleRows) {
    if (s.source === 'resale') cogs += avgResaleCost(s.itemId) * s.qty
    else cogs += recipeUnitCost(s.itemId) * s.qty
  }

  const woRows = db
    .select()
    .from(writeOffs)
    .where(and(gte(writeOffs.date, from), lt(writeOffs.date, to)))
    .all()
  let writeOffCost = 0
  for (const w of woRows) {
    if (w.kind === 'Ingredient') writeOffCost += avgIngredientCost(w.itemId) * w.qty
    else if (w.kind === 'Product') {
      // try manufactured then resale cost
      const rc = recipeUnitCost(w.itemId)
      writeOffCost += (rc > 0 ? rc : avgResaleCost(w.itemId)) * w.qty
    }
  }

  const pay =
    db
      .select({ a: sql<number>`coalesce(sum(${payroll.amount}), 0)` })
      .from(payroll)
      .where(and(gte(payroll.date, from), lt(payroll.date, to)))
      .get()?.a ?? 0

  const oh =
    db
      .select({ a: sql<number>`coalesce(sum(${expenses.gel}), 0)` })
      .from(expenses)
      .where(and(gte(expenses.date, from), lt(expenses.date, to)))
      .get()?.a ?? 0

  const ohTotal = pay + oh

  // allocated = sum of daily pools on days that had production in range (simplified)
  const prodDates = db
    .select({ d: productionRuns.date })
    .from(productionRuns)
    .where(and(gte(productionRuns.date, from), lt(productionRuns.date, to)))
    .groupBy(productionRuns.date)
    .all()
  let allocated = 0
  for (const { d } of prodDates) allocated += dailyPool(d)

  const unallocated = Math.max(0, ohTotal - allocated)
  const gross = revenue - cogs
  const net = gross - writeOffCost - unallocated

  return {
    revenue,
    cogs,
    gross,
    writeOffCost,
    ohTotal,
    allocated,
    unallocated,
    net,
  }
}

export function nextId(prefix: string, existing: string[]): string {
  let max = 0
  for (const id of existing) {
    const m = id.match(/-(\d+)$/)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}-${String(max + 1).padStart(2, '0')}`
}

export { desc, eq }
