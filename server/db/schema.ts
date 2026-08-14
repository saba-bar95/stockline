import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  real,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** Multi-tenant production ops. Local SQLite; same shape maps to Neon Postgres in production. */

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    role: text("role").notNull().default("owner"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex("memberships_user_unique").on(t.userId)],
);

export const ingredients = sqliteTable(
  "ingredients",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    category: text("category").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("ingredients_org_idx").on(t.organizationId)],
);

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("products_org_idx").on(t.organizationId)],
);

export const resaleProducts = sqliteTable(
  "resale_products",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    category: text("category").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("resale_org_idx").on(t.organizationId)],
);

export const recipeLines = sqliteTable(
  "recipe_lines",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    productId: text("product_id").notNull(),
    ingredientId: text("ingredient_id").notNull(),
    qty: real("qty").notNull(),
  },
  (t) => [index("recipes_org_idx").on(t.organizationId)],
);

export const purchases = sqliteTable(
  "purchases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    date: text("date").notNull(),
    kind: text("kind").notNull(),
    itemId: text("item_id").notNull(),
    qty: real("qty").notNull(),
    unitPrice: real("unit_price").notNull(),
    total: real("total").notNull(),
    note: text("note").notNull().default(""),
  },
  (t) => [index("purchases_org_idx").on(t.organizationId)],
);

export const productionRuns = sqliteTable(
  "production_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    date: text("date").notNull(),
    productId: text("product_id").notNull(),
    qty: real("qty").notNull(),
    ingredientUnitCost: real("ingredient_unit_cost").notNull().default(0),
  },
  (t) => [index("production_org_idx").on(t.organizationId)],
);

/** Ingredient qty consumed per production run (snapshot at run time). */
export const productionIngredientUsage = sqliteTable(
  "production_ingredient_usage",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    runId: integer("run_id").notNull(),
    ingredientId: text("ingredient_id").notNull(),
    qty: real("qty").notNull(),
  },
  (t) => [
    index("prod_ing_usage_org_idx").on(t.organizationId),
    index("prod_ing_usage_run_idx").on(t.runId),
  ],
);

export const sales = sqliteTable(
  "sales",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    date: text("date").notNull(),
    source: text("source").notNull(),
    itemId: text("item_id").notNull(),
    qty: real("qty").notNull(),
    unitPrice: real("unit_price").notNull(),
    revenue: real("revenue").notNull(),
  },
  (t) => [index("sales_org_idx").on(t.organizationId)],
);

export const writeOffs = sqliteTable(
  "write_offs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    date: text("date").notNull(),
    kind: text("kind").notNull(),
    itemId: text("item_id").notNull(),
    qty: real("qty").notNull(),
    note: text("note").notNull().default(""),
  },
  (t) => [index("writeoffs_org_idx").on(t.organizationId)],
);

export const employees = sqliteTable(
  "employees",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    position: text("position").notNull().default(""),
    dailyRate: real("daily_rate").notNull().default(0),
    status: text("status").notNull().default("აქტიური"),
  },
  (t) => [index("employees_org_idx").on(t.organizationId)],
);

export const payroll = sqliteTable(
  "payroll",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    date: text("date").notNull(),
    employeeId: text("employee_id").notNull(),
    amount: real("amount").notNull(),
  },
  (t) => [index("payroll_org_idx").on(t.organizationId)],
);

export const expenses = sqliteTable(
  "expenses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    date: text("date").notNull(),
    type: text("type").notNull(),
    name: text("name").notNull(),
    gel: real("gel").notNull().default(0),
    usd: real("usd").notNull().default(0),
    rate: real("rate").notNull().default(0),
  },
  (t) => [index("expenses_org_idx").on(t.organizationId)],
);
