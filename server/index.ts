import 'dotenv/config'
import { serve } from '@hono/node-server'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { authMiddleware, getOrg, renameOrg, revokeFreshOAuthLink } from './auth.ts'
import { db, migrate } from './db/index.ts'
import {
  avgIngredientCost,
  avgResaleCost,
  ingredientStock,
  lastPurchaseDate,
  newId,
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
import { handleExportCsv, handleExportWorkbook } from './export.ts'

migrate()

type Vars = {
  Variables: {
    userId: string
    organizationId: string
    orgName: string
  }
}

const app = new Hono<Vars>().basePath('/api')

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return allowedOrigins[0] ?? ''
      return allowedOrigins.includes(origin) ? origin : ''
    },
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
)
app.use('*', secureHeaders())

/** Simple in-memory rate limit (per IP). Enough for portfolio; use Redis in heavy prod. */
const hits = new Map<string, { n: number; reset: number }>()
app.use('*', async (c, next) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  const now = Date.now()
  let bucket = hits.get(ip)
  if (!bucket || now > bucket.reset) {
    bucket = { n: 0, reset: now + 60_000 }
    hits.set(ip, bucket)
  }
  bucket.n += 1
  if (bucket.n > 120) {
    return c.json({ error: 'Too many requests' }, 429)
  }
  return next()
})

app.use('*', authMiddleware)

app.onError((err, c) => {
  console.error(err)
  if (err instanceof z.ZodError) {
    return c.json({ error: 'Invalid request' }, 400)
  }
  return c.json({ error: 'Something went wrong' }, 500)
})

app.get('/health', (c) => c.json({ ok: true, app: 'mise' }))

app.get('/me', (c) =>
  c.json({
    userId: c.get('userId'),
    organizationId: c.get('organizationId'),
    orgName: c.get('orgName'),
  }),
)

/** After Google OAuth: undo auto-link when email was registered with password. */
app.post('/auth/revoke-fresh-oauth', async (c) => {
  const userId = c.get('userId')
  const result = await revokeFreshOAuthLink(userId)
  return c.json(result)
})

app.patch('/me/org', async (c) => {
  const body = z.object({ name: z.string().min(1).max(80) }).parse(await c.req.json())
  const orgId = getOrg(c)
  await renameOrg(orgId, body.name)
  return c.json({ ok: true, name: body.name.slice(0, 80) })
})

// —— Ingredients ——
function ingredientHasOps(orgId: string, id: string): boolean {
  const purchase = db
    .select({ id: purchases.id })
    .from(purchases)
    .where(
      and(
        eq(purchases.organizationId, orgId),
        eq(purchases.kind, 'Ingredient'),
        eq(purchases.itemId, id),
      ),
    )
    .get()
  if (purchase) return true
  const writeOff = db
    .select({ id: writeOffs.id })
    .from(writeOffs)
    .where(
      and(eq(writeOffs.organizationId, orgId), eq(writeOffs.kind, 'Ingredient'), eq(writeOffs.itemId, id)),
    )
    .get()
  if (writeOff) return true
  const recipe = db
    .select({ id: recipeLines.id })
    .from(recipeLines)
    .where(and(eq(recipeLines.organizationId, orgId), eq(recipeLines.ingredientId, id)))
    .get()
  return !!recipe
}

app.get('/ingredients', (c) => {
  const orgId = getOrg(c)
  const rows = db
    .select()
    .from(ingredients)
    .where(eq(ingredients.organizationId, orgId))
    .orderBy(ingredients.name)
    .all()
  return c.json(
    rows.map((r) => ({
      ...r,
      avgCost: avgIngredientCost(orgId, r.id),
      stock: ingredientStock(orgId, r.id),
      lastPurchaseDate: lastPurchaseDate(orgId, r.id),
      canDelete: !ingredientHasOps(orgId, r.id),
    })),
  )
})

app.get('/ingredients/:id/history', (c) => {
  const orgId = getOrg(c)
  const id = c.req.param('id')
  const ing = db
    .select()
    .from(ingredients)
    .where(and(eq(ingredients.organizationId, orgId), eq(ingredients.id, id)))
    .get()
  if (!ing) return c.json({ error: 'არ მოიძებნა' }, 404)

  const pur = db
    .select()
    .from(purchases)
    .where(
      and(
        eq(purchases.organizationId, orgId),
        eq(purchases.kind, 'Ingredient'),
        eq(purchases.itemId, id),
      ),
    )
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

  const prodNames = Object.fromEntries(
    db
      .select()
      .from(products)
      .where(eq(products.organizationId, orgId))
      .all()
      .map((p) => [p.id, p.name]),
  )
  const used: Array<{
    date: string
    type: string
    qty: number
    unitPrice: number
    total: number
    note: string
  }> = []
  const avg = avgIngredientCost(orgId, id)
  for (const run of db
    .select()
    .from(productionRuns)
    .where(eq(productionRuns.organizationId, orgId))
    .all()) {
    const line = db
      .select()
      .from(recipeLines)
      .where(
        and(
          eq(recipeLines.organizationId, orgId),
          eq(recipeLines.productId, run.productId),
          eq(recipeLines.ingredientId, id),
        ),
      )
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
    .where(
      and(eq(writeOffs.organizationId, orgId), eq(writeOffs.kind, 'Ingredient'), eq(writeOffs.itemId, id)),
    )
    .orderBy(desc(writeOffs.date))
    .all()
    .map((w) => ({
      date: w.date,
      type: 'ჩამოწერა',
      qty: -w.qty,
      unitPrice: avgIngredientCost(orgId, id),
      total: -w.qty * avgIngredientCost(orgId, id),
      note: w.note,
    }))

  const movements = [...pur, ...used, ...wo].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  return c.json({
    ingredient: {
      ...ing,
      avgCost: avgIngredientCost(orgId, id),
      stock: ingredientStock(orgId, id),
      lastPurchaseDate: lastPurchaseDate(orgId, id),
    },
    movements,
  })
})

app.post('/ingredients', async (c) => {
  const orgId = getOrg(c)
  const body = z
    .object({
      name: z.string().min(1),
      unit: z.string().min(1),
      category: z.string().optional(),
    })
    .parse(await c.req.json())
  const id = newId()
  db.insert(ingredients)
    .values({
      id,
      organizationId: orgId,
      name: body.name,
      unit: body.unit,
      category: body.category ?? '',
    })
    .run()
  return c.json({ id }, 201)
})

app.delete('/ingredients/:id', (c) => {
  const orgId = getOrg(c)
  const id = c.req.param('id')
  const ing = db
    .select()
    .from(ingredients)
    .where(and(eq(ingredients.organizationId, orgId), eq(ingredients.id, id)))
    .get()
  if (!ing) return c.json({ error: 'არ მოიძებნა' }, 404)
  if (ingredientHasOps(orgId, id)) {
    return c.json(
      {
        error: 'წაშლა შეუძლებელია — ინგრედიენტზე უკვე არის შესყიდვა, რეცეპტი ან ჩამოწერა',
      },
      409,
    )
  }
  db.delete(ingredients)
    .where(and(eq(ingredients.organizationId, orgId), eq(ingredients.id, id)))
    .run()
  return c.json({ ok: true })
})

// —— Products (manufactured) ——
app.get('/products', (c) => {
  const orgId = getOrg(c)
  const rows = db
    .select()
    .from(products)
    .where(eq(products.organizationId, orgId))
    .orderBy(products.name)
    .all()
  return c.json(
    rows.map((r) => {
      const qtyIn = productQtyIn(orgId, r.id)
      const ingUnit = productIngredientUnitCost(orgId, r.id)
      const ohUnit = productOverheadUnitCost(orgId, r.id)
      const fullUnit = productFullUnitCost(orgId, r.id)
      const stock = productStock(orgId, r.id)
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
  const orgId = getOrg(c)
  const body = z.object({ name: z.string().min(1), unit: z.string().min(1) }).parse(await c.req.json())
  const id = newId()
  db.insert(products).values({ id, organizationId: orgId, name: body.name, unit: body.unit }).run()
  return c.json({ id }, 201)
})

// —— Resale ——
app.get('/resale', (c) => {
  const orgId = getOrg(c)
  const rows = db
    .select()
    .from(resaleProducts)
    .where(eq(resaleProducts.organizationId, orgId))
    .orderBy(resaleProducts.name)
    .all()
  return c.json(
    rows.map((r) => {
      const unitCost = avgResaleCost(orgId, r.id)
      const stock = resaleStock(orgId, r.id)
      return { ...r, unitCost, stock, stockValue: stock * unitCost }
    }),
  )
})

app.post('/resale', async (c) => {
  const orgId = getOrg(c)
  const body = z
    .object({ name: z.string().min(1), unit: z.string().min(1), category: z.string().optional() })
    .parse(await c.req.json())
  const id = newId()
  db.insert(resaleProducts)
    .values({
      id,
      organizationId: orgId,
      name: body.name,
      unit: body.unit,
      category: body.category ?? '',
    })
    .run()
  return c.json({ id }, 201)
})

// —— Recipes ——
app.get('/recipes', (c) => {
  const orgId = getOrg(c)
  const lines = db.select().from(recipeLines).where(eq(recipeLines.organizationId, orgId)).all()
  const ings = Object.fromEntries(
    db
      .select()
      .from(ingredients)
      .where(eq(ingredients.organizationId, orgId))
      .all()
      .map((i) => [i.id, i]),
  )
  const prods = Object.fromEntries(
    db
      .select()
      .from(products)
      .where(eq(products.organizationId, orgId))
      .all()
      .map((p) => [p.id, p]),
  )
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
  const orgId = getOrg(c)
  const body = z
    .object({
      productId: z.string(),
      ingredientId: z.string(),
      qty: z.number().positive(),
    })
    .parse(await c.req.json())
  const prod = db
    .select()
    .from(products)
    .where(and(eq(products.organizationId, orgId), eq(products.id, body.productId)))
    .get()
  const ing = db
    .select()
    .from(ingredients)
    .where(and(eq(ingredients.organizationId, orgId), eq(ingredients.id, body.ingredientId)))
    .get()
  if (!prod || !ing) return c.json({ error: 'Invalid product or ingredient' }, 400)
  db.insert(recipeLines)
    .values({
      organizationId: orgId,
      productId: body.productId,
      ingredientId: body.ingredientId,
      qty: body.qty,
    })
    .run()
  return c.json({ ok: true }, 201)
})

app.delete('/recipes/:id', (c) => {
  const orgId = getOrg(c)
  db.delete(recipeLines)
    .where(
      and(eq(recipeLines.organizationId, orgId), eq(recipeLines.id, Number(c.req.param('id')))),
    )
    .run()
  return c.json({ ok: true })
})

// —— Purchases ——
app.get('/purchases', (c) => {
  const orgId = getOrg(c)
  return c.json(
    db
      .select()
      .from(purchases)
      .where(eq(purchases.organizationId, orgId))
      .orderBy(desc(purchases.date), desc(purchases.id))
      .all(),
  )
})

app.post('/purchases', async (c) => {
  const orgId = getOrg(c)
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
      organizationId: orgId,
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
  const orgId = getOrg(c)
  const rows = db
    .select()
    .from(productionRuns)
    .where(eq(productionRuns.organizationId, orgId))
    .orderBy(desc(productionRuns.date))
    .all()
  const names = Object.fromEntries(
    db
      .select()
      .from(products)
      .where(eq(products.organizationId, orgId))
      .all()
      .map((p) => [p.id, p.name]),
  )
  return c.json(
    rows.map((r) => {
      const unitSnap = r.ingredientUnitCost > 0 ? r.ingredientUnitCost : recipeUnitCost(orgId, r.productId)
      const ingTotal = runIngredientTotal(orgId, r)
      const ohTotal = runOverheadTotal(orgId, r.date, r.productId, r.qty, r.id)
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
  const orgId = getOrg(c)
  const body = z
    .object({ date: z.string(), productId: z.string(), qty: z.number().positive() })
    .parse(await c.req.json())
  const prod = db
    .select()
    .from(products)
    .where(and(eq(products.organizationId, orgId), eq(products.id, body.productId)))
    .get()
  if (!prod) return c.json({ error: 'Product not found' }, 404)
  const lines = db
    .select()
    .from(recipeLines)
    .where(and(eq(recipeLines.organizationId, orgId), eq(recipeLines.productId, body.productId)))
    .all()
  for (const line of lines) {
    const need = line.qty * body.qty
    const have = ingredientStock(orgId, line.ingredientId)
    if (have + 1e-9 < need) {
      return c.json(
        { error: `არასაკმარისი ნაშთი: ${line.ingredientId} (სჭირდება ${need}, არის ${have})` },
        400,
      )
    }
  }
  const snap = recipeUnitCost(orgId, body.productId)
  db.insert(productionRuns)
    .values({
      organizationId: orgId,
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
  const orgId = getOrg(c)
  return c.json(
    db.select().from(sales).where(eq(sales.organizationId, orgId)).orderBy(desc(sales.date)).all(),
  )
})

app.post('/sales', async (c) => {
  const orgId = getOrg(c)
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
    body.source === 'manufactured'
      ? productStock(orgId, body.itemId)
      : resaleStock(orgId, body.itemId)
  if (stock + 1e-9 < body.qty) {
    return c.json({ error: `არასაკმარისი ნაშთი (არის ${stock})` }, 400)
  }
  db.insert(sales)
    .values({
      organizationId: orgId,
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
  const orgId = getOrg(c)
  return c.json(
    db
      .select()
      .from(writeOffs)
      .where(eq(writeOffs.organizationId, orgId))
      .orderBy(desc(writeOffs.date))
      .all(),
  )
})

app.post('/write-offs', async (c) => {
  const orgId = getOrg(c)
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
      organizationId: orgId,
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
app.get('/employees', (c) => {
  const orgId = getOrg(c)
  return c.json(
    db.select().from(employees).where(eq(employees.organizationId, orgId)).orderBy(employees.name).all(),
  )
})

app.post('/employees', async (c) => {
  const orgId = getOrg(c)
  const body = z
    .object({
      name: z.string().min(1),
      dailyRate: z.number().nonnegative(),
      status: z.string().optional(),
    })
    .parse(await c.req.json())
  const id = newId()
  db.insert(employees)
    .values({
      id,
      organizationId: orgId,
      name: body.name,
      dailyRate: body.dailyRate,
      status: body.status ?? 'აქტიური',
    })
    .run()
  return c.json({ id }, 201)
})

app.get('/payroll', (c) => {
  const orgId = getOrg(c)
  return c.json(
    db.select().from(payroll).where(eq(payroll.organizationId, orgId)).orderBy(desc(payroll.date)).all(),
  )
})

app.post('/payroll', async (c) => {
  const orgId = getOrg(c)
  const body = z
    .object({ date: z.string(), employeeId: z.string(), amount: z.number().positive() })
    .parse(await c.req.json())
  const emp = db
    .select()
    .from(employees)
    .where(and(eq(employees.organizationId, orgId), eq(employees.id, body.employeeId)))
    .get()
  if (!emp) return c.json({ error: 'Employee not found' }, 404)
  db.insert(payroll)
    .values({
      organizationId: orgId,
      date: body.date,
      employeeId: body.employeeId,
      amount: body.amount,
    })
    .run()
  return c.json({ ok: true }, 201)
})

// —— Expenses ——
app.get('/expenses', (c) => {
  const orgId = getOrg(c)
  return c.json(
    db.select().from(expenses).where(eq(expenses.organizationId, orgId)).orderBy(desc(expenses.date)).all(),
  )
})

app.post('/expenses', async (c) => {
  const orgId = getOrg(c)
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
      organizationId: orgId,
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
  const orgId = getOrg(c)
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth()
  const d = today.getDate()
  const dayStart = today.toISOString().slice(0, 10)
  const dayEnd = new Date(y, m, d + 1).toISOString().slice(0, 10)
  const weekStartDate = new Date(y, m, d - ((today.getDay() + 6) % 7))
  const weekStart = weekStartDate.toISOString().slice(0, 10)
  const weekEnd = new Date(
    weekStartDate.getFullYear(),
    weekStartDate.getMonth(),
    weekStartDate.getDate() + 7,
  )
    .toISOString()
    .slice(0, 10)
  const monthStart = `${y}-${String(m + 1).padStart(2, '0')}-01`
  const monthEnd = new Date(y, m + 1, 1).toISOString().slice(0, 10)

  return c.json({
    day: plSummary(orgId, dayStart, dayEnd),
    week: plSummary(orgId, weekStart, weekEnd),
    month: plSummary(orgId, monthStart, monthEnd),
  })
})

// —— Exports (org-scoped only) ——
app.get('/export/workbook.xlsx', async (c) => {
  return handleExportWorkbook(c, getOrg(c))
})

app.get('/export/csv/:entity', async (c) => {
  return handleExportCsv(c, getOrg(c), c.req.param('entity'))
})

export { app }

const thisFile = fileURLToPath(import.meta.url)
const isDirectRun =
  process.argv[1] != null && path.resolve(process.argv[1]) === path.resolve(thisFile)

if (isDirectRun && process.env.VITEST !== 'true') {
  const port = Number(process.env.PORT || 3001)
  console.log(`Mise API http://localhost:${port}`)
  serve({ fetch: app.fetch, port })
}
