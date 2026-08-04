import {
  pgTable,
  text,
  real,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/** Neon Postgres mirror of the SQLite multi-tenant schema. */

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    role: text("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("memberships_user_idx").on(t.userId)],
);

export const ingredients = pgTable(
  "ingredients",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    category: text("category").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("ingredients_org_idx").on(t.organizationId)],
);

export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("products_org_idx").on(t.organizationId)],
);

export const resaleProducts = pgTable(
  "resale_products",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    category: text("category").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("resale_org_idx").on(t.organizationId)],
);

export const recipeLines = pgTable(
  "recipe_lines",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    productId: text("product_id").notNull(),
    ingredientId: text("ingredient_id").notNull(),
    qty: real("qty").notNull(),
  },
  (t) => [index("recipes_org_idx").on(t.organizationId)],
);

export const purchases = pgTable(
  "purchases",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
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

export const productionRuns = pgTable(
  "production_runs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
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

export const sales = pgTable(
  "sales",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
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

export const writeOffs = pgTable(
  "write_offs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
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

export const employees = pgTable(
  "employees",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    dailyRate: real("daily_rate").notNull().default(0),
    status: text("status").notNull().default("აქტიური"),
  },
  (t) => [index("employees_org_idx").on(t.organizationId)],
);

export const payroll = pgTable(
  "payroll",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    date: text("date").notNull(),
    employeeId: text("employee_id").notNull(),
    amount: real("amount").notNull(),
  },
  (t) => [index("payroll_org_idx").on(t.organizationId)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
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
