import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { db, migrate } from './db/index.ts'
import {
  avgIngredientCost,
  avgResaleCost,
  ingredientStock,
  lastPurchaseDate,
  nextId,
  plSummary,
  productFullUnitCost,
  productIngredientUnitCost,
  productOverheadUnitCost,
  productQtyIn,
  productStock,
  recipeUnitCost,
  resaleStock,
  runIngredientTotal,
  runOverheadTotal,
} from './db/logic.ts'
import {
  employees,
  expenses,
  ingredients,
  payroll,
  productionRuns,
  products,
  purchases,
  recipeLines,
  resaleProducts,
  sales,
  writeOffs,
} from './db/schema.ts'

migrate()

const app = new Hono().basePath('/api')
app.use('*', cors())

app.get('/health', (c) => c.json({ ok: true }))

// —— Ingredients ——
app.get('/ingredients', (c) => {
  const rows = db.select().from(ingredients).orderBy(ingredients.name).all()
  return c.json(
    rows.map((r) => ({
      ...r,
      avgCost: avgIngredientCost(r.id),
      stock: ingredientStock(r.id),
      lastPurchaseDate: lastPurchaseDate(r.id),
    })),
  )
})

app.get('/ingredients/:id/history', (c) => {
  const id = c.req.param('id')
  const ing = db.select().from(ingredients).where(eq(ingredients.id, id)).get()
  if (!ing) return c.json({ error: 'არ მოიძებნა' }, 404)

  const pur = db
    .select()
    .from(purchases)
    .where(and(eq(purchases.kind, 'Ingredient'), eq(purchases.itemId, id)))
    .orderBy(desc(purchases.date))
    .all()
    .map((p) => ({
      date: p.date,
      type: 'შესყიდვა',
      qty: p.qty,
      unitPrice: p.unitPrice,
      total: p.total,
      note: p.note,
    }))

  const prodNames = Object.fromEntries(db.select().from(products).all().map((p) => [p.id, p.name]))
  const used: Array<{
    date: string
    type: string
    qty: number
    unitPrice: number
    total: number
    note: string
  }> = []
  const avg = avgIngredientCost(id)
  for (const run of db.select().from(productionRuns).all()) {
    const line = db
      .select()
      .from(recipeLines)
      .where(and(eq(recipeLines.productId, run.productId), eq(recipeLines.ingredientId, id)))
      .get()
    if (!line) continue
    const usedQty = run.qty * line.qty
    used.push({
      date: run.date,
      type: 'წარმოება',
      qty: -usedQty,
      unitPrice: avg,
      total: -usedQty * avg,
      note: prodNames[run.productId] ?? run.productId,
    })
  }

  const wo = db
    .select()
    .from(writeOffs)
    .where(and(eq(writeOffs.kind, 'Ingredient'), eq(writeOffs.itemId, id)))
    .orderBy(desc(writeOffs.date))
    .all()
    .map((w) => ({
      date: w.date,
      type: 'ჩამოწერა',
      qty: -w.qty,
      unitPrice: avgIngredientCost(id),
      total: -w.qty * avgIngredientCost(id),
      note: w.note,
    }))

  const movements = [...pur, ...used, ...wo].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  return c.json({
    ingredient: {
      ...ing,
      avgCost: avgIngredientCost(id),
      stock: ingredientStock(id),
      lastPurchaseDate: lastPurchaseDate(id),
    },
    movements,
  })
})

app.post('/ingredients', async (c) => {
  const body = z
    .object({
      name: z.string().min(1),
      unit: z.string().min(1),
      category: z.string().optional(),
    })
    .parse(await c.req.json())
  const existing = db.select({ id: ingredients.id }).from(ingredients).all().map((x) => x.id)
  const id = nextId('ი', existing)
  db.insert(ingredients)
    .values({ id, name: body.name, unit: body.unit, category: body.category ?? '' })
    .run()
  return c.json({ id }, 201)
})

// —— Products (manufactured) ——
app.get('/products', (c) => {
  const rows = db.select().from(products).orderBy(products.name).all()
  return c.json(
    rows.map((r) => {
      const qtyIn = productQtyIn(r.id)
      const ingUnit = productIngredientUnitCost(r.id)
      const ohUnit = productOverheadUnitCost(r.id)
      const fullUnit = productFullUnitCost(r.id)
      const stock = productStock(r.id)
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
      }
    }),
  )
})

app.post('/products', async (c) => {
  const body = z.object({ name: z.string().min(1), unit: z.string().min(1) }).parse(await c.req.json())
  const existing = db.select({ id: products.id }).from(products).all().map((x) => x.id)
  const id = nextId('პ', existing)
  db.insert(products).values({ id, name: body.name, unit: body.unit }).run()
  return c.json({ id }, 201)
})

// —— Resale ——
app.get('/resale', (c) => {
  const rows = db.select().from(resaleProducts).orderBy(resaleProducts.name).all()
  return c.json(
    rows.map((r) => {
      const unitCost = avgResaleCost(r.id)
      const stock = resaleStock(r.id)
      return { ...r, unitCost, stock, stockValue: stock * unitCost }
    }),
  )
})

app.post('/resale', async (c) => {
  const body = z
    .object({ name: z.string().min(1), unit: z.string().min(1), category: z.string().optional() })
    .parse(await c.req.json())
  const existing = db.select({ id: resaleProducts.id }).from(resaleProducts).all().map((x) => x.id)
  const id = nextId('რ', existing)
  db.insert(resaleProducts)
    .values({ id, name: body.name, unit: body.unit, category: body.category ?? '' })
    .run()
  return c.json({ id }, 201)
})

// —— Recipes ——
app.get('/recipes', (c) => {
  const lines = db.select().from(recipeLines).all()
  const ings = Object.fromEntries(db.select().from(ingredients).all().map((i) => [i.id, i]))
  const prods = Object.fromEntries(db.select().from(products).all().map((p) => [p.id, p]))
  return c.json(
    lines.map((l) => ({
      ...l,
      productName: prods[l.productId]?.name ?? l.productId,
      ingredientName: ings[l.ingredientId]?.name ?? l.ingredientId,
      unit: ings[l.ingredientId]?.unit ?? '',
    })),
  )
})

app.post('/recipes', async (c) => {
  const body = z
    .object({
      productId: z.string(),
      ingredientId: z.string(),
      qty: z.number().positive(),
    })
    .parse(await c.req.json())
  db.insert(recipeLines)
    .values({ productId: body.productId, ingredientId: body.ingredientId, qty: body.qty })
    .run()
  return c.json({ ok: true }, 201)
})

app.delete('/recipes/:id', (c) => {
  db.delete(recipeLines).where(eq(recipeLines.id, Number(c.req.param('id')))).run()
  return c.json({ ok: true })
})

// —— Purchases ——
app.get('/purchases', (c) => {
  return c.json(db.select().from(purchases).orderBy(desc(purchases.date), desc(purchases.id)).all())
})

app.post('/purchases', async (c) => {
  const body = z
    .object({
      date: z.string(),
      kind: z.enum(['Ingredient', 'Product']),
      itemId: z.string(),
      qty: z.number().positive(),
      unitPrice: z.number().nonnegative(),
      note: z.string().optional(),
    })
    .parse(await c.req.json())
  const total = body.qty * body.unitPrice
  db.insert(purchases)
    .values({
      date: body.date,
      kind: body.kind,
      itemId: body.itemId,
      qty: body.qty,
      unitPrice: body.unitPrice,
      total,
      note: body.note ?? '',
    })
    .run()
  return c.json({ ok: true }, 201)
})

// —— Production ——
app.get('/production', (c) => {
  const rows = db.select().from(productionRuns).orderBy(desc(productionRuns.date)).all()
  const names = Object.fromEntries(db.select().from(products).all().map((p) => [p.id, p.name]))
  return c.json(
    rows.map((r) => {
      const unitSnap = r.ingredientUnitCost > 0 ? r.ingredientUnitCost : recipeUnitCost(r.productId)
      const ingTotal = runIngredientTotal(r)
      const ohTotal = runOverheadTotal(r.date, r.productId, r.qty, r.id)
      return {
        ...r,
        productName: names[r.productId] ?? r.productId,
        unitCost: unitSnap,
        ingredientCost: ingTotal,
        overheadCost: ohTotal,
        fullCost: ingTotal + ohTotal,
      }
    }),
  )
})

app.post('/production', async (c) => {
  const body = z
    .object({ date: z.string(), productId: z.string(), qty: z.number().positive() })
    .parse(await c.req.json())
  const lines = db.select().from(recipeLines).where(eq(recipeLines.productId, body.productId)).all()
  for (const line of lines) {
    const need = line.qty * body.qty
    const have = ingredientStock(line.ingredientId)
    if (have + 1e-9 < need) {
      return c.json(
        { error: `არასაკმარისი ნაშთი: ${line.ingredientId} (სჭირდება ${need}, არის ${have})` },
        400,
      )
    }
  }
  const snap = recipeUnitCost(body.productId)
  db.insert(productionRuns)
    .values({
      date: body.date,
      productId: body.productId,
      qty: body.qty,
      ingredientUnitCost: snap,
    })
    .run()
  return c.json({ ok: true }, 201)
})

// —— Sales ——
app.get('/sales', (c) => {
  return c.json(db.select().from(sales).orderBy(desc(sales.date)).all())
})

app.post('/sales', async (c) => {
  const body = z
    .object({
      date: z.string(),
      source: z.enum(['manufactured', 'resale']),
      itemId: z.string(),
      qty: z.number().positive(),
      unitPrice: z.number().nonnegative(),
    })
    .parse(await c.req.json())
  const stock =
    body.source === 'manufactured' ? productStock(body.itemId) : resaleStock(body.itemId)
  if (stock + 1e-9 < body.qty) {
    return c.json({ error: `არასაკმარისი ნაშთი (არის ${stock})` }, 400)
  }
  db.insert(sales)
    .values({
      date: body.date,
      source: body.source,
      itemId: body.itemId,
      qty: body.qty,
      unitPrice: body.unitPrice,
      revenue: body.qty * body.unitPrice,
    })
    .run()
  return c.json({ ok: true }, 201)
})

// —— Write-offs ——
app.get('/write-offs', (c) => {
  return c.json(db.select().from(writeOffs).orderBy(desc(writeOffs.date)).all())
})

app.post('/write-offs', async (c) => {
  const body = z
    .object({
      date: z.string(),
      kind: z.enum(['Ingredient', 'Product']),
      itemId: z.string(),
      qty: z.number().positive(),
      note: z.string().optional(),
    })
    .parse(await c.req.json())
  db.insert(writeOffs)
    .values({
      date: body.date,
      kind: body.kind,
      itemId: body.itemId,
      qty: body.qty,
      note: body.note ?? '',
    })
    .run()
  return c.json({ ok: true }, 201)
})

// —— Employees / payroll ——
app.get('/employees', (c) => c.json(db.select().from(employees).orderBy(employees.name).all()))

app.post('/employees', async (c) => {
  const body = z
    .object({
      name: z.string().min(1),
      dailyRate: z.number().nonnegative(),
      status: z.string().optional(),
    })
    .parse(await c.req.json())
  const existing = db.select({ id: employees.id }).from(employees).all().map((x) => x.id)
  const id = nextId('თ', existing)
  db.insert(employees)
    .values({
      id,
      name: body.name,
      dailyRate: body.dailyRate,
      status: body.status ?? 'აქტიური',
    })
    .run()
  return c.json({ id }, 201)
})

app.get('/payroll', (c) => c.json(db.select().from(payroll).orderBy(desc(payroll.date)).all()))

app.post('/payroll', async (c) => {
  const body = z
    .object({ date: z.string(), employeeId: z.string(), amount: z.number().positive() })
    .parse(await c.req.json())
  db.insert(payroll)
    .values({ date: body.date, employeeId: body.employeeId, amount: body.amount })
    .run()
  return c.json({ ok: true }, 201)
})

// —— Expenses ——
app.get('/expenses', (c) => c.json(db.select().from(expenses).orderBy(desc(expenses.date)).all()))

app.post('/expenses', async (c) => {
  const body = z
    .object({
      date: z.string(),
      type: z.string(),
      name: z.string(),
      gel: z.number().optional(),
      usd: z.number().optional(),
      rate: z.number().optional(),
    })
    .parse(await c.req.json())
  let gel = body.gel ?? 0
  if ((body.usd ?? 0) > 0 && (body.rate ?? 0) > 0) gel = body.usd! * body.rate!
  db.insert(expenses)
    .values({
      date: body.date,
      type: body.type,
      name: body.name,
      gel,
      usd: body.usd ?? 0,
      rate: body.rate ?? 0,
    })
    .run()
  return c.json({ ok: true }, 201)
})

// —— P&L ——
app.get('/pl', (c) => {
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth()
  const d = today.getDate()
  const dayStart = today.toISOString().slice(0, 10)
  const dayEnd = new Date(y, m, d + 1).toISOString().slice(0, 10)
  const weekStartDate = new Date(y, m, d - ((today.getDay() + 6) % 7))
  const weekStart = weekStartDate.toISOString().slice(0, 10)
  const weekEnd = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate() + 7)
    .toISOString()
    .slice(0, 10)
  const monthStart = `${y}-${String(m + 1).padStart(2, '0')}-01`
  const monthEnd = new Date(y, m + 1, 1).toISOString().slice(0, 10)

  return c.json({
    day: plSummary(dayStart, dayEnd),
    week: plSummary(weekStart, weekEnd),
    month: plSummary(monthStart, monthEnd),
  })
})

const port = Number(process.env.PORT || 3001)
console.log(`MZA API http://localhost:${port}`)
serve({ fetch: app.fetch, port })
