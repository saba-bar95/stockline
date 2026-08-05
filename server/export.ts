import { s } from "./db/tables.ts";
import ExcelJS from "exceljs";
import { desc, eq } from "drizzle-orm";
import type { Context } from "hono";
import { db, qAll } from "./db/index.ts";
import { plAllSummaries } from "./db/logic.ts";
const {
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
} = s;
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
async function orgTables(orgId: string) {
  const filter = (table: { organizationId: unknown }) =>
    eq(table.organizationId as never, orgId);
  return {
    ingredients: await qAll(
      db
        .select()
        .from(ingredients)
        .where(filter(ingredients))
        .orderBy(ingredients.name),
    ),
    products: await qAll(
      db.select().from(products).where(filter(products)).orderBy(products.name),
    ),
    resale: await qAll(
      db
        .select()
        .from(resaleProducts)
        .where(filter(resaleProducts))
        .orderBy(resaleProducts.name),
    ),
    recipes: await qAll(
      db.select().from(recipeLines).where(filter(recipeLines)),
    ),
    purchases: await qAll(
      db
        .select()
        .from(purchases)
        .where(filter(purchases))
        .orderBy(desc(purchases.date)),
    ),
    production: await qAll(
      db
        .select()
        .from(productionRuns)
        .where(filter(productionRuns))
        .orderBy(desc(productionRuns.date)),
    ),
    sales: await qAll(
      db.select().from(sales).where(filter(sales)).orderBy(desc(sales.date)),
    ),
    writeOffs: await qAll(
      db
        .select()
        .from(writeOffs)
        .where(filter(writeOffs))
        .orderBy(desc(writeOffs.date)),
    ),
    employees: await qAll(
      db
        .select()
        .from(employees)
        .where(filter(employees))
        .orderBy(employees.name),
    ),
    payroll: await qAll(
      db
        .select()
        .from(payroll)
        .where(filter(payroll))
        .orderBy(desc(payroll.date)),
    ),
    expenses: await qAll(
      db
        .select()
        .from(expenses)
        .where(filter(expenses))
        .orderBy(desc(expenses.date)),
    ),
  };
}
async function plSnapshot(orgId: string) {
  return plAllSummaries(orgId);
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
async function entityRows(
  orgId: string,
  entity: Entity,
): Promise<Record<string, unknown>[]> {
  const data = await orgTables(orgId);
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
      const pl = await plSnapshot(orgId);
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
  const rows = await entityRows(orgId, entity as Entity);
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
    const rows = await entityRows(orgId, entity);
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
