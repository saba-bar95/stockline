/**
 * Import exported Excel JSON (scripts/export/*.json) into an organization.
 *
 * Local SQLite (default when DATABASE_URL is unset):
 *   npx tsx scripts/import_excel.ts
 *
 * Neon / a specific Clerk kitchen:
 *   IMPORT_ORG_ID=<org uuid> IMPORT_USER_ID=<clerk user_…> npx tsx scripts/import_excel.ts
 *
 * Wipes only that organization's operational data before insert (not other kitchens).
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, isPostgres, migrate, qGet, qRun } from "../server/db/index.ts";
import { s } from "../server/db/tables.ts";
import {
  avgIngredientCost,
  ingredientStock,
  productFullUnitCost,
  productIngredientUnitCost,
  productOverheadUnitCost,
  productStock,
  recipeUnitCost,
} from "../server/db/logic.ts";

const {
  organizations,
  memberships,
  ingredients,
  products,
  resaleProducts,
  recipeLines,
  purchases,
  productionRuns,
  sales,
  writeOffs,
  employees,
  payroll,
  expenses,
} = s;

const ORG_ID = process.env.IMPORT_ORG_ID || "dev_local_org";
const OWNER_USER =
  process.env.IMPORT_USER_ID ||
  process.env.IMPORT_OWNER_USER_ID ||
  "dev_local_user";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, "export");

function read<T>(name: string): T {
  const p = path.join(dir, name);
  if (!fs.existsSync(p)) return [] as T;
  const raw = fs.readFileSync(p, "utf8").trim();
  if (!raw) return [] as T;
  return JSON.parse(raw) as T;
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function isDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

async function ensureOrg() {
  const existing = await qGet(
    db.select().from(organizations).where(eq(organizations.id, ORG_ID)),
  );
  if (existing) return;

  await qRun(
    db.insert(organizations).values({
      id: ORG_ID,
      name: ORG_ID === "dev_local_org" ? "Local Kitchen" : "My Kitchen",
      ownerUserId: OWNER_USER,
    }),
  );
  await qRun(
    db.insert(memberships).values({
      id: crypto.randomUUID(),
      userId: OWNER_USER,
      organizationId: ORG_ID,
      role: "owner",
    }),
  );
}

async function wipeOrgData() {
  await qRun(
    db.delete(recipeLines).where(eq(recipeLines.organizationId, ORG_ID)),
  );
  await qRun(db.delete(purchases).where(eq(purchases.organizationId, ORG_ID)));
  await qRun(
    db
      .delete(productionRuns)
      .where(eq(productionRuns.organizationId, ORG_ID)),
  );
  await qRun(db.delete(sales).where(eq(sales.organizationId, ORG_ID)));
  await qRun(db.delete(writeOffs).where(eq(writeOffs.organizationId, ORG_ID)));
  await qRun(db.delete(payroll).where(eq(payroll.organizationId, ORG_ID)));
  await qRun(db.delete(expenses).where(eq(expenses.organizationId, ORG_ID)));
  await qRun(db.delete(employees).where(eq(employees.organizationId, ORG_ID)));
  await qRun(db.delete(products).where(eq(products.organizationId, ORG_ID)));
  await qRun(
    db.delete(resaleProducts).where(eq(resaleProducts.organizationId, ORG_ID)),
  );
  await qRun(
    db.delete(ingredients).where(eq(ingredients.organizationId, ORG_ID)),
  );
}

async function main() {
  if (!isPostgres) migrate();

  console.log(
    `Importing Excel → ${isPostgres ? "Neon/Postgres" : "SQLite"} org=${ORG_ID}`,
  );

  await ensureOrg();
  await wipeOrgData();

  const seenIng = new Set<string>();
  const ings =
    read<Array<{ id: string; name: string; unit: string; category: string }>>(
      "ingredients.json",
    );
  for (const r of ings) {
    if (!r.id || !r.name) continue;
    if (seenIng.has(r.id)) continue;
    seenIng.add(r.id);
    await qRun(
      db.insert(ingredients).values({
        id: r.id,
        organizationId: ORG_ID,
        name: r.name,
        unit: r.unit || "ც",
        category: r.category || "",
      }),
    );
  }

  const seenProd = new Set<string>();
  const prods =
    read<Array<{ id: string; name: string; unit: string }>>("products.json");
  const nameToId = new Map<string, string>();
  for (const r of prods) {
    if (!r.id || !r.name) continue;
    if (seenProd.has(r.id)) continue;
    seenProd.add(r.id);
    await qRun(
      db.insert(products).values({
        id: r.id,
        organizationId: ORG_ID,
        name: r.name,
        unit: r.unit || "ც",
      }),
    );
    nameToId.set(r.name.trim(), r.id);
  }

  const resale =
    read<Array<{ id: string; name: string; unit: string; category: string }>>(
      "resale.json",
    );
  for (const r of resale) {
    if (!r.id || !r.name) continue;
    await qRun(
      db.insert(resaleProducts).values({
        id: r.id,
        organizationId: ORG_ID,
        name: r.name,
        unit: r.unit || "ც",
        category: r.category || "",
      }),
    );
  }

  const recipes =
    read<Array<{ ingredientId: string; productName: string; qty: number }>>(
      "recipes.json",
    );
  let recipeOk = 0;
  let recipeSkip = 0;
  for (const r of recipes) {
    const productId = nameToId.get(String(r.productName || "").trim());
    if (!productId || !r.ingredientId || !r.qty) {
      recipeSkip++;
      continue;
    }
    await qRun(
      db.insert(recipeLines).values({
        organizationId: ORG_ID,
        productId,
        ingredientId: r.ingredientId,
        qty: Number(r.qty),
      }),
    );
    recipeOk++;
  }

  const purs =
    read<
      Array<{
        date: string;
        c2: string;
        c5: string;
        c6: string;
        c7: string;
        c8: string;
      }>
    >("purchases_raw.json");
  let purN = 0;
  for (const r of purs) {
    if (!isDate(r.date)) continue;
    const kind = r.c8 === "Product" ? "Product" : "Ingredient";
    const itemId = String(r.c2 || "").trim();
    const qty = num(r.c5);
    const unitPrice = num(r.c6);
    if (!itemId || qty <= 0) continue;
    const total = num(r.c7) || qty * unitPrice;
    await qRun(
      db.insert(purchases).values({
        organizationId: ORG_ID,
        date: r.date,
        kind,
        itemId,
        qty,
        unitPrice,
        total,
        note: "",
      }),
    );
    purN++;
  }

  const runs =
    read<Array<{ date: string; id: string; qty: string; unitCost?: string }>>(
      "production.json",
    );
  let runN = 0;
  for (const r of runs) {
    if (!isDate(r.date) || !r.id || num(r.qty) <= 0) continue;
    const snap = num(r.unitCost ?? "0");
    await qRun(
      db.insert(productionRuns).values({
        organizationId: ORG_ID,
        date: r.date,
        productId: r.id,
        qty: num(r.qty),
        ingredientUnitCost:
          snap > 0 ? snap : await recipeUnitCost(ORG_ID, r.id),
      }),
    );
    runN++;
  }

  const saleRows =
    read<
      Array<{ date: string; id: string; qty: string; c5: string; c8: string }>
    >("sales.json");
  const prodIds = new Set(prods.map((p) => p.id));
  let saleN = 0;
  for (const r of saleRows) {
    if (!isDate(r.date) || !r.id || num(r.qty) <= 0) continue;
    const source = prodIds.has(r.id) ? "manufactured" : "resale";
    const unitPrice = num(r.c5);
    const revenue = num(r.c8) || num(r.qty) * unitPrice;
    await qRun(
      db.insert(sales).values({
        organizationId: ORG_ID,
        date: r.date,
        source,
        itemId: r.id,
        qty: num(r.qty),
        unitPrice,
        revenue,
      }),
    );
    saleN++;
  }

  const wos =
    read<
      Array<{ date: string; c2: string; c3: string; c5: string; c8: string }>
    >("writeoffs.json");
  let woN = 0;
  for (const r of wos) {
    if (!isDate(r.date) || !r.c3 || num(r.c5) <= 0) continue;
    const kind = r.c2 === "Product" ? "Product" : "Ingredient";
    await qRun(
      db.insert(writeOffs).values({
        organizationId: ORG_ID,
        date: r.date,
        kind,
        itemId: String(r.c3).trim(),
        qty: num(r.c5),
        note: String(r.c8 || ""),
      }),
    );
    woN++;
  }

  const emps =
    read<Array<{ c1: string; c2: string; c3: string; c4: string; c5: string }>>(
      "employees.json",
    );
  let empN = 0;
  for (const r of emps) {
    if (!r.c1 || !r.c2) continue;
    await qRun(
      db.insert(employees).values({
        id: r.c1,
        organizationId: ORG_ID,
        name: r.c2,
        position: String(r.c3 || ""),
        dailyRate: num(r.c4),
        status: r.c5 || "აქტიური",
      }),
    );
    empN++;
  }

  const pays =
    read<Array<{ date: string; c2: string; c5: string }>>("payroll.json");
  let payN = 0;
  for (const r of pays) {
    if (!isDate(r.date) || !r.c2 || num(r.c5) <= 0) continue;
    await qRun(
      db.insert(payroll).values({
        organizationId: ORG_ID,
        date: r.date,
        employeeId: r.c2,
        amount: num(r.c5),
      }),
    );
    payN++;
  }

  const exps =
    read<
      Array<{
        date: string;
        type: string;
        name: string;
        c4: string;
        c5: string;
        gel: string;
      }>
    >("expenses.json");
  let expN = 0;
  for (const r of exps) {
    if (!isDate(r.date)) continue;
    if (
      !r.type ||
      r.type === "ტიპი" ||
      r.type === "TITLE" ||
      r.type === "ხელფასი"
    )
      continue;
    const gel = num(r.gel);
    if (gel <= 0 && num(r.c4) <= 0) continue;
    await qRun(
      db.insert(expenses).values({
        organizationId: ORG_ID,
        date: r.date,
        type: r.type,
        name: r.name || r.type,
        gel: gel || num(r.c4) * num(r.c5),
        usd: num(r.c4),
        rate: num(r.c5),
      }),
    );
    expN++;
  }

  console.log(
    JSON.stringify(
      {
        ingredients: ings.length,
        products: prods.length,
        recipes: recipeOk,
        recipeSkip,
        purchases: purN,
        production: runN,
        sales: saleN,
        writeOffs: woN,
        employees: empN,
        payroll: payN,
        expenses: expN,
      },
      null,
      2,
    ),
  );

  const snap = read<
    Array<{
      id: string;
      name: string;
      qtyIn: string;
      ingUnit: string;
      ohUnit: string;
      stock: string;
      fullUnit: string;
    }>
  >("excel_product_snapshot.json");

  console.log("\nCompare sample products vs Excel snapshot:");
  for (const id of ["პ-02", "პ-03", "პ-06"]) {
    const row = snap.find((x) => x.id === id);
    if (!row) continue;
    console.log({
      id,
      name: row.name,
      excelIngUnit: row.ingUnit,
      appIngUnit: (await productIngredientUnitCost(ORG_ID, id)).toFixed(2),
      excelOhUnit: row.ohUnit,
      appOhUnit: (await productOverheadUnitCost(ORG_ID, id)).toFixed(2),
      appFullUnit: (await productFullUnitCost(ORG_ID, id)).toFixed(2),
      excelQtyIn: row.qtyIn,
      appStock: (await productStock(ORG_ID, id)).toFixed(3),
    });
  }

  const sampleIng = ings[0]?.id;
  if (sampleIng) {
    console.log("\nSample ingredient", sampleIng, {
      stock: await ingredientStock(ORG_ID, sampleIng),
      avgCost: await avgIngredientCost(ORG_ID, sampleIng),
    });
  }

  console.log("\nImport complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
