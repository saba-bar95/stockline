import ExcelJS from "exceljs";
import { desc, eq } from "drizzle-orm";
import type { Context } from "hono";
import { db } from "./db/index.ts";
import { plSummary } from "./db/logic.ts";
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
} from "./db/schema.ts";

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]!);
  const lines = [keys.join(",")];
  for (const row of rows) {
    lines.push(keys.map((k) => csvEscape(row[k])).join(","));
  }
  return lines.join("\n");
}

function orgTables(orgId: string) {
  const filter = (table: { organizationId: unknown }) =>
    eq(table.organizationId as never, orgId);
  return {
    ingredients: db
      .select()
      .from(ingredients)
      .where(filter(ingredients))
      .orderBy(ingredients.name)
      .all(),
    products: db
      .select()
      .from(products)
      .where(filter(products))
      .orderBy(products.name)
      .all(),
    resale: db
      .select()
      .from(resaleProducts)
      .where(filter(resaleProducts))
      .orderBy(resaleProducts.name)
      .all(),
    recipes: db.select().from(recipeLines).where(filter(recipeLines)).all(),
    purchases: db
      .select()
      .from(purchases)
      .where(filter(purchases))
      .orderBy(desc(purchases.date))
      .all(),
    production: db
      .select()
      .from(productionRuns)
      .where(filter(productionRuns))
      .orderBy(desc(productionRuns.date))
      .all(),
    sales: db
      .select()
      .from(sales)
      .where(filter(sales))
      .orderBy(desc(sales.date))
      .all(),
    writeOffs: db
      .select()
      .from(writeOffs)
      .where(filter(writeOffs))
      .orderBy(desc(writeOffs.date))
      .all(),
    employees: db
      .select()
      .from(employees)
      .where(filter(employees))
      .orderBy(employees.name)
      .all(),
    payroll: db
      .select()
      .from(payroll)
      .where(filter(payroll))
      .orderBy(desc(payroll.date))
      .all(),
    expenses: db
      .select()
      .from(expenses)
      .where(filter(expenses))
      .orderBy(desc(expenses.date))
      .all(),
  };
}

function plSnapshot(orgId: string) {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  const dayStart = today.toISOString().slice(0, 10);
  const dayEnd = new Date(y, m, d + 1).toISOString().slice(0, 10);
  const weekStartDate = new Date(y, m, d - ((today.getDay() + 6) % 7));
  const weekStart = weekStartDate.toISOString().slice(0, 10);
  const weekEnd = new Date(
    weekStartDate.getFullYear(),
    weekStartDate.getMonth(),
    weekStartDate.getDate() + 7,
  )
    .toISOString()
    .slice(0, 10);
  const monthStart = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const monthEnd = new Date(y, m + 1, 1).toISOString().slice(0, 10);
  return {
    day: plSummary(orgId, dayStart, dayEnd),
    week: plSummary(orgId, weekStart, weekEnd),
    month: plSummary(orgId, monthStart, monthEnd),
  };
}

const ENTITIES = [
  "ingredients",
  "products",
  "resale",
  "recipes",
  "purchases",
  "production",
  "sales",
  "write-offs",
  "employees",
  "payroll",
  "expenses",
  "pl",
] as const;

type Entity = (typeof ENTITIES)[number];

function entityRows(orgId: string, entity: Entity): Record<string, unknown>[] {
  const data = orgTables(orgId);
  switch (entity) {
    case "ingredients":
      return data.ingredients as unknown as Record<string, unknown>[];
    case "products":
      return data.products as unknown as Record<string, unknown>[];
    case "resale":
      return data.resale as unknown as Record<string, unknown>[];
    case "recipes":
      return data.recipes as unknown as Record<string, unknown>[];
    case "purchases":
      return data.purchases as unknown as Record<string, unknown>[];
    case "production":
      return data.production as unknown as Record<string, unknown>[];
    case "sales":
      return data.sales as unknown as Record<string, unknown>[];
    case "write-offs":
      return data.writeOffs as unknown as Record<string, unknown>[];
    case "employees":
      return data.employees as unknown as Record<string, unknown>[];
    case "payroll":
      return data.payroll as unknown as Record<string, unknown>[];
    case "expenses":
      return data.expenses as unknown as Record<string, unknown>[];
    case "pl": {
      const pl = plSnapshot(orgId);
      return [
        { period: "day", ...pl.day },
        { period: "week", ...pl.week },
        { period: "month", ...pl.month },
      ];
    }
  }
}

export async function handleExportCsv(
  c: Context,
  orgId: string,
  entity: string,
) {
  if (!ENTITIES.includes(entity as Entity)) {
    return c.json({ error: "Unknown export entity" }, 400);
  }
  const rows = entityRows(orgId, entity as Entity);
  const body = toCsv(rows);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mise-${entity}.csv"`,
    },
  });
}

export async function handleExportWorkbook(_c: Context, orgId: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Mise";
  wb.created = new Date();

  for (const entity of ENTITIES) {
    const rows = entityRows(orgId, entity);
    const sheet = wb.addWorksheet(entity.slice(0, 31));
    if (!rows.length) {
      sheet.addRow(["(empty)"]);
      continue;
    }
    const keys = Object.keys(rows[0]!);
    sheet.addRow(keys);
    for (const row of rows) {
      sheet.addRow(keys.map((k) => row[k] ?? ""));
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="mise-export.xlsx"',
    },
  });
}
