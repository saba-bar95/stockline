import { sql } from 'drizzle-orm'
import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core'

/** Local SQLite now; swap driver to Neon Postgres later with the same shape. */

export const ingredients = sqliteTable('ingredients', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  unit: text('unit').notNull(),
  category: text('category').notNull().default(''),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  unit: text('unit').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

export const resaleProducts = sqliteTable('resale_products', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  unit: text('unit').notNull(),
  category: text('category').notNull().default(''),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

export const recipeLines = sqliteTable('recipe_lines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: text('product_id').notNull().references(() => products.id),
  ingredientId: text('ingredient_id').notNull().references(() => ingredients.id),
  qty: real('qty').notNull(),
})

export const purchases = sqliteTable('purchases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(),
  kind: text('kind').notNull(), // Ingredient | Product
  itemId: text('item_id').notNull(),
  qty: real('qty').notNull(),
  unitPrice: real('unit_price').notNull(),
  total: real('total').notNull(),
  note: text('note').notNull().default(''),
})

export const productionRuns = sqliteTable('production_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(),
  productId: text('product_id').notNull().references(() => products.id),
  qty: real('qty').notNull(),
})

export const sales = sqliteTable('sales', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(),
  source: text('source').notNull(), // manufactured | resale
  itemId: text('item_id').notNull(),
  qty: real('qty').notNull(),
  unitPrice: real('unit_price').notNull(),
  revenue: real('revenue').notNull(),
})

export const writeOffs = sqliteTable('write_offs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(),
  kind: text('kind').notNull(), // Ingredient | Product
  itemId: text('item_id').notNull(),
  qty: real('qty').notNull(),
  note: text('note').notNull().default(''),
})

export const employees = sqliteTable('employees', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  dailyRate: real('daily_rate').notNull().default(0),
  status: text('status').notNull().default('აქტიური'),
})

export const payroll = sqliteTable('payroll', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(),
  employeeId: text('employee_id').notNull().references(() => employees.id),
  amount: real('amount').notNull(),
})

export const expenses = sqliteTable('expenses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(),
  type: text('type').notNull(), // იჯარა | კომუნალური | სხვა
  name: text('name').notNull(),
  gel: real('gel').notNull().default(0),
  usd: real('usd').notNull().default(0),
  rate: real('rate').notNull().default(0),
})
