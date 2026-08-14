import { s } from "../db/tables.ts";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../index.ts";
import { db, qGet, qRun } from "../db/index.ts";
import {
  dailyPool,
  ingredientStock,
  newId,
  plDetails,
  plSummary,
  productFullUnitCost,
  productStock,
  runOverheadTotal,
} from "../db/logic.ts";

const {
  employees,
  ingredients,
  memberships,
  organizations,
  payroll,
  productionRuns,
  products,
  purchases,
  recipeLines,
} = s;

const ORG = "test_flow_org";
const USER = "test_flow_user";
const PROD2 = "test_flow_prod2";

function api(
  path: string,
  init: RequestInit & { userId: string; orgId: string },
) {
  const headers = new Headers(init.headers);
  headers.set("X-Test-User-Id", init.userId);
  headers.set("X-Test-Org-Id", init.orgId);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return app.request(path, { ...init, headers }) as Promise<Response>;
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

beforeAll(async () => {
  await qRun(
    db.insert(organizations).values({
      id: ORG,
      name: "Flow Kitchen",
      ownerUserId: USER,
    }),
  );
  await qRun(
    db.insert(memberships).values({
      id: newId(),
      userId: USER,
      organizationId: ORG,
      role: "owner",
    }),
  );
});

describe("payroll ↔ production ↔ P&L", () => {
  it("absorbs same-day wages into production cost and sold COGS", async () => {
    const createdIng = await api("/api/ingredients", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({ name: "Flour", unit: "kg", category: "dry" }),
    });
    expect(createdIng.status).toBe(201);
    const ingId = (await json<{ id: string }>(createdIng)).id;

    const createdProd = await api("/api/products", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({ name: "Bread", unit: "pc" }),
    });
    expect(createdProd.status).toBe(201);
    const prodId = (await json<{ id: string }>(createdProd)).id;

    const recipe = await api("/api/recipes", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        productId: prodId,
        ingredientId: ingId,
        qty: 0.5,
      }),
    });
    expect(recipe.status).toBe(201);

    const buy = await api("/api/purchases", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-08-01",
        kind: "Ingredient",
        itemId: ingId,
        qty: 100,
        unitPrice: 10,
      }),
    });
    expect(buy.status).toBe(201);

    const emp = await api("/api/employees", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        name: "Nino",
        position: "Baker",
        dailyRate: 100,
      }),
    });
    expect(emp.status).toBe(201);
    const empId = (await json<{ id: string }>(emp)).id;

    const pay = await api("/api/payroll", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-08-10",
        employeeId: empId,
        amount: 100,
      }),
    });
    expect(pay.status).toBe(201);

    const made = await api("/api/production", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-08-10",
        productId: prodId,
        qty: 10,
      }),
    });
    expect(made.status).toBe(201);

    expect(await dailyPool(ORG, "2026-08-10")).toBeCloseTo(100, 6);
    // Materials 10 × 0.5kg × 10 = 50; wages 100 → full unit 15
    expect(await productFullUnitCost(ORG, prodId)).toBeCloseTo(15, 6);

    const sold = await api("/api/sales", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-08-10",
        source: "manufactured",
        itemId: prodId,
        qty: 4,
        unitPrice: 20,
      }),
    });
    expect(sold.status).toBe(201);

    const summary = await plSummary(ORG, "2026-08-10", "2026-08-11");
    expect(summary.revenue).toBeCloseTo(80, 6);
    expect(summary.cogs).toBeCloseTo(60, 6);
    expect(summary.allocated).toBeCloseTo(100, 6);
    expect(summary.unallocated).toBeCloseTo(0, 6);
    expect(summary.net).toBeCloseTo(20, 6);

    const idlePay = await api("/api/payroll", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-08-11",
        employeeId: empId,
        amount: 40,
      }),
    });
    expect(idlePay.status).toBe(201);

    const withIdle = await plSummary(ORG, "2026-08-10", "2026-08-12");
    expect(withIdle.ohTotal).toBeCloseTo(140, 6);
    expect(withIdle.allocated).toBeCloseTo(100, 6);
    expect(withIdle.unallocated).toBeCloseTo(40, 6);
    expect(withIdle.net).toBeCloseTo(-20, 6);

    const pays = await json<Array<{ id: number; date: string; amount: number }>>(
      await api("/api/payroll", { method: "GET", userId: USER, orgId: ORG }),
    );
    const idle = pays.find((p) => p.date === "2026-08-11" && p.amount === 40);
    expect(idle).toBeTruthy();

    const moved = await api(`/api/payroll/${idle!.id}`, {
      method: "PATCH",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-08-10",
        employeeId: empId,
        amount: 40,
      }),
    });
    expect(moved.status).toBe(200);
    expect(await productFullUnitCost(ORG, prodId)).toBeCloseTo(19, 6);

    const afterMove = await plSummary(ORG, "2026-08-10", "2026-08-12");
    expect(afterMove.allocated).toBeCloseTo(140, 6);
    expect(afterMove.unallocated).toBeCloseTo(0, 6);
    expect(afterMove.cogs).toBeCloseTo(76, 6);
    expect(afterMove.net).toBeCloseTo(4, 6);

    const del = await api(`/api/payroll/${idle!.id}`, {
      method: "DELETE",
      userId: USER,
      orgId: ORG,
    });
    expect(del.status).toBe(200);
    expect(await productFullUnitCost(ORG, prodId)).toBeCloseTo(15, 6);
    const restored = await plSummary(ORG, "2026-08-10", "2026-08-12");
    expect(restored.net).toBeCloseTo(20, 6);
    expect(restored.unallocated).toBeCloseTo(0, 6);

    const wo = await api("/api/write-offs", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-08-10",
        kind: "Product",
        itemId: prodId,
        qty: 2,
      }),
    });
    expect(wo.status).toBe(201);
    const afterWo = await plSummary(ORG, "2026-08-10", "2026-08-12");
    expect(afterWo.writeOffCost).toBeCloseTo(30, 6);
    expect(afterWo.net).toBeCloseTo(-10, 6);

    expect(await productStock(ORG, prodId)).toBeCloseTo(4, 6);
    expect(await ingredientStock(ORG, ingId)).toBeCloseTo(95, 6);

    const delIng = await api(`/api/ingredients/${ingId}`, {
      method: "DELETE",
      userId: USER,
      orgId: ORG,
    });
    expect(delIng.status).toBe(409);

    const details = await plDetails(ORG, "2026-08-10", "2026-08-12");
    const dailyNet = details.daily.reduce((sum, d) => sum + d.net, 0);
    expect(details.summary.net).toBeCloseTo(dailyNet, 6);
    expect(details.summary.allocated + details.summary.unallocated).toBeCloseTo(
      details.summary.ohTotal,
      6,
    );
  });

  it("splits same-day overhead by material cost, not by quantity", async () => {
    await qRun(
      db.insert(products).values({
        id: PROD2,
        organizationId: ORG,
        name: "Cake",
        unit: "pc",
      }),
    );
    const bread = await qGet(
      db
        .select()
        .from(products)
        .where(and(eq(products.organizationId, ORG), eq(products.name, "Bread"))),
    );
    const flour = await qGet(
      db
        .select()
        .from(recipeLines)
        .where(
          and(
            eq(recipeLines.organizationId, ORG),
            eq(recipeLines.productId, bread!.id),
          ),
        ),
    );
    await qRun(
      db.insert(recipeLines).values({
        organizationId: ORG,
        productId: PROD2,
        ingredientId: flour!.ingredientId,
        qty: 1.5,
      }),
    );

    const madeCake = await api("/api/production", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-08-12",
        productId: PROD2,
        qty: 10,
      }),
    });
    expect(madeCake.status).toBe(201);
    const madeBread = await api("/api/production", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-08-12",
        productId: bread!.id,
        qty: 10,
      }),
    });
    expect(madeBread.status).toBe(201);

    const emp = await qGet(
      db.select().from(employees).where(eq(employees.organizationId, ORG)),
    );
    const payRes = await api("/api/payroll", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-08-12",
        employeeId: emp!.id,
        amount: 80,
      }),
    });
    expect(payRes.status).toBe(201);

    const cakeRun = await qGet(
      db
        .select()
        .from(productionRuns)
        .where(
          and(
            eq(productionRuns.organizationId, ORG),
            eq(productionRuns.productId, PROD2),
          ),
        ),
    );
    const breadRun = await qGet(
      db
        .select()
        .from(productionRuns)
        .where(
          and(
            eq(productionRuns.organizationId, ORG),
            eq(productionRuns.productId, bread!.id),
            eq(productionRuns.date, "2026-08-12"),
          ),
        ),
    );
    const cakeOh = await runOverheadTotal(
      ORG,
      "2026-08-12",
      PROD2,
      10,
      cakeRun!.id,
    );
    const breadOh = await runOverheadTotal(
      ORG,
      "2026-08-12",
      bread!.id,
      10,
      breadRun!.id,
    );
    // Cake G = 150, bread G = 50, pool 80 → 60 / 20
    expect(cakeOh).toBeCloseTo(60, 6);
    expect(breadOh).toBeCloseTo(20, 6);
    expect(cakeOh + breadOh).toBeCloseTo(80, 6);
  });

  it("still allocates wages when material cost is zero", async () => {
    const zeroIng = "test_flow_free_ing";
    const zeroProd = "test_flow_free_prod";
    await qRun(
      db.insert(ingredients).values({
        id: zeroIng,
        organizationId: ORG,
        name: "Water",
        unit: "l",
        category: "wet",
      }),
    );
    await qRun(
      db.insert(products).values({
        id: zeroProd,
        organizationId: ORG,
        name: "Ice",
        unit: "pc",
      }),
    );
    await qRun(
      db.insert(recipeLines).values({
        organizationId: ORG,
        productId: zeroProd,
        ingredientId: zeroIng,
        qty: 1,
      }),
    );
    await qRun(
      db.insert(purchases).values({
        organizationId: ORG,
        date: "2026-08-01",
        kind: "Ingredient",
        itemId: zeroIng,
        qty: 50,
        unitPrice: 0,
        total: 0,
        note: "",
      }),
    );
    const emp = await qGet(
      db.select().from(employees).where(eq(employees.organizationId, ORG)),
    );
    await qRun(
      db.insert(payroll).values({
        organizationId: ORG,
        date: "2026-08-13",
        employeeId: emp!.id,
        amount: 30,
      }),
    );
    const made = await api("/api/production", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-08-13",
        productId: zeroProd,
        qty: 5,
      }),
    });
    expect(made.status).toBe(201);
    expect(await productFullUnitCost(ORG, zeroProd)).toBeCloseTo(6, 6);
    const summary = await plSummary(ORG, "2026-08-13", "2026-08-14");
    expect(summary.allocated).toBeCloseTo(30, 6);
    expect(summary.unallocated).toBeCloseTo(0, 6);
  });
});

describe("employee / payroll guards", () => {
  it("rejects payroll for inactive employees and bad dates", async () => {
    const created = await api("/api/employees", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        name: "Giorgi",
        position: "Helper",
        dailyRate: 40,
      }),
    });
    const empId = (await json<{ id: string }>(created)).id;
    await api(`/api/employees/${empId}`, {
      method: "PATCH",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        name: "Giorgi",
        position: "Helper",
        dailyRate: 40,
        status: "არააქტიური",
      }),
    });
    const blocked = await api("/api/payroll", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "2026-08-10",
        employeeId: empId,
        amount: 40,
      }),
    });
    expect(blocked.status).toBe(400);
    expect((await json<{ code?: string }>(blocked)).code).toBe(
      "employee_inactive",
    );

    const badDate = await api("/api/payroll", {
      method: "POST",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: "10/08/2026",
        employeeId: empId,
        amount: 10,
      }),
    });
    expect(badDate.status).toBe(400);
  });

  it("keeps an existing payroll row when that employee is later inactive", async () => {
    const row = await qGet(
      db
        .select()
        .from(payroll)
        .where(eq(payroll.organizationId, ORG)),
    );
    expect(row).toBeTruthy();
    const emp = await qGet(
      db
        .select()
        .from(employees)
        .where(
          and(eq(employees.organizationId, ORG), eq(employees.id, row!.employeeId)),
        ),
    );
    await qRun(
      db
        .update(employees)
        .set({ status: "არააქტიური" })
        .where(eq(employees.id, emp!.id)),
    );
    const patch = await api(`/api/payroll/${row!.id}`, {
      method: "PATCH",
      userId: USER,
      orgId: ORG,
      body: JSON.stringify({
        date: row!.date,
        employeeId: row!.employeeId,
        amount: row!.amount,
      }),
    });
    expect(patch.status).toBe(200);
    await qRun(
      db
        .update(employees)
        .set({ status: "აქტიური" })
        .where(eq(employees.id, emp!.id)),
    );
  });
});
