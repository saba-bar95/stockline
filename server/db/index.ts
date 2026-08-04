import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data");

const rawUrl = process.env.DATABASE_URL;
const isMemory = Boolean(rawUrl?.includes(":memory:"));

if (!isMemory) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function resolveDbPath(): string {
  if (!rawUrl) return path.join(dataDir, "mise.sqlite");
  if (rawUrl.startsWith("file:")) return rawUrl.slice(5);
  return rawUrl;
}

const dbPath = resolveDbPath();

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export const rawSqlite = sqlite;

export function migrate() {
  // Fresh multi-tenant schema. Legacy mza.sqlite is not auto-migrated.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS memberships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      role TEXT NOT NULL DEFAULT 'owner',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships(user_id);

    CREATE TABLE IF NOT EXISTS ingredients (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS ingredients_org_idx ON ingredients(organization_id);

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS products_org_idx ON products(organization_id);

    CREATE TABLE IF NOT EXISTS resale_products (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS resale_org_idx ON resale_products(organization_id);

    CREATE TABLE IF NOT EXISTS recipe_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      product_id TEXT NOT NULL,
      ingredient_id TEXT NOT NULL,
      qty REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS recipes_org_idx ON recipe_lines(organization_id);

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      date TEXT NOT NULL,
      kind TEXT NOT NULL,
      item_id TEXT NOT NULL,
      qty REAL NOT NULL,
      unit_price REAL NOT NULL,
      total REAL NOT NULL,
      note TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS purchases_org_idx ON purchases(organization_id);

    CREATE TABLE IF NOT EXISTS production_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      date TEXT NOT NULL,
      product_id TEXT NOT NULL,
      qty REAL NOT NULL,
      ingredient_unit_cost REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS production_org_idx ON production_runs(organization_id);

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      date TEXT NOT NULL,
      source TEXT NOT NULL,
      item_id TEXT NOT NULL,
      qty REAL NOT NULL,
      unit_price REAL NOT NULL,
      revenue REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sales_org_idx ON sales(organization_id);

    CREATE TABLE IF NOT EXISTS write_offs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      date TEXT NOT NULL,
      kind TEXT NOT NULL,
      item_id TEXT NOT NULL,
      qty REAL NOT NULL,
      note TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS writeoffs_org_idx ON write_offs(organization_id);

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      name TEXT NOT NULL,
      daily_rate REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'აქტიური'
    );
    CREATE INDEX IF NOT EXISTS employees_org_idx ON employees(organization_id);

    CREATE TABLE IF NOT EXISTS payroll (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      date TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      amount REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS payroll_org_idx ON payroll(organization_id);

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      gel REAL NOT NULL DEFAULT 0,
      usd REAL NOT NULL DEFAULT 0,
      rate REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS expenses_org_idx ON expenses(organization_id);
  `);
}
