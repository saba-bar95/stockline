import { s } from "./tables.ts";
import { and, eq, gte, lt, sql, desc } from "drizzle-orm";
import { db, qAll, qGet, qRun } from "./index.ts";
const {
  expenses,
  payroll,
  productionRuns,
  productionIngredientUsage,
  products,
  purchases,
  recipeLines,
  resaleProducts,
  sales,
  writeOffs,
  ingredients,
} = s;
function orgEq<
  T extends {
    organizationId: unknown;
  },
>(column: T["organizationId"], orgId: string) {
  return eq(column as never, orgId);
}
/** Calendar date in local timezone (YYYY-MM-DD), not UTC. */
export function localDateYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayLocal() {
  return localDateYmd(new Date());
}

/** Round qty for error messages (avoids float noise like 0.544999…). */
export function formatQty(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return String(n);
  return String(Number(n.toFixed(decimals)));
}

/** Excel wsIng col G: SUM(purchase totals) / SUM(qty) for Ingredient. */
export async function avgIngredientCost(
  orgId: string,
  ingredientId: string,
): Promise<number> {
  const row = await qGet(
    db
      .select({
        total: sql<number>`coalesce(sum(${purchases.total}), 0)`,
        qty: sql<number>`coalesce(sum(${purchases.qty}), 0)`,
      })
      .from(purchases)
      .where(
        and(
          orgEq(purchases.organizationId, orgId),
          eq(purchases.kind, "Ingredient"),
          eq(purchases.itemId, ingredientId),
        ),
      ),
  );
  if (!row || !row.qty) return 0;
  return row.total / row.qty;
}
/** Live recipe × current ingredient averages (Excel fRecipe / ProductUnitCost). */
export async function recipeUnitCost(
  orgId: string,
  productId: string,
): Promise<number> {
  const lines = await qAll(
    db
      .select()
      .from(recipeLines)
      .where(
        and(
          orgEq(recipeLines.organizationId, orgId),
          eq(recipeLines.productId, productId),
        ),
      ),
  );
  let total = 0;
  for (const line of lines) {
    total += line.qty * (await avgIngredientCost(orgId, line.ingredientId));
  }
  return total;
}

export type PurchaseTimelineConflict = {
  conflictDate: string;
  conflictKind: "production" | "writeOff" | "sale";
};

type TimelineEvent = {
  date: string;
  delta: number;
  /** outs only — what caused the drop */
  conflictKind?: PurchaseTimelineConflict["conflictKind"];
};

/**
 * Walk purchases vs usage in date order. Purchases on a day apply before
 * consumption that day. Returns the first date stock would go negative.
 */
export function findPurchaseTimelineConflict(
  purchaseRows: Array<{ date: string; qty: number }>,
  outRows: Array<{
    date: string;
    qty: number;
    conflictKind: PurchaseTimelineConflict["conflictKind"];
  }>,
): PurchaseTimelineConflict | null {
  const events: TimelineEvent[] = [
    ...purchaseRows.map((p) => ({ date: p.date, delta: p.qty })),
    ...outRows.map((o) => ({
      date: o.date,
      delta: -o.qty,
      conflictKind: o.conflictKind,
    })),
  ];
  events.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    // Same day: inflows before outflows
    if (a.delta >= 0 && b.delta < 0) return -1;
    if (a.delta < 0 && b.delta >= 0) return 1;
    return 0;
  });
  let stock = 0;
  for (const ev of events) {
    stock += ev.delta;
    if (stock < -1e-9 && ev.conflictKind) {
      return { conflictDate: ev.date, conflictKind: ev.conflictKind };
    }
  }
  return null;
}

async function ingredientConsumptionEvents(
  orgId: string,
  ingredientId: string,
): Promise<
  Array<{
    date: string;
    qty: number;
    conflictKind: PurchaseTimelineConflict["conflictKind"];
  }>
> {
  const fromSnapshot = await qAll(
    db
      .select({
        date: productionRuns.date,
        qty: productionIngredientUsage.qty,
      })
      .from(productionIngredientUsage)
      .innerJoin(
        productionRuns,
        eq(productionIngredientUsage.runId, productionRuns.id),
      )
      .where(
        and(
          orgEq(productionIngredientUsage.organizationId, orgId),
          eq(productionIngredientUsage.ingredientId, ingredientId),
        ),
      ),
  );
  const fromLegacy = await qAll(
    db
      .select({
        date: productionRuns.date,
        qty: sql<number>`${productionRuns.qty} * ${recipeLines.qty}`,
      })
      .from(productionRuns)
      .innerJoin(
        recipeLines,
        and(
          eq(recipeLines.productId, productionRuns.productId),
          eq(recipeLines.organizationId, productionRuns.organizationId),
        ),
      )
      .where(
        and(
          orgEq(productionRuns.organizationId, orgId),
          eq(recipeLines.ingredientId, ingredientId),
          sql`NOT EXISTS (SELECT 1 FROM production_ingredient_usage u WHERE u.run_id = ${productionRuns.id})`,
        ),
      ),
  );
  const written = await qAll(
    db
      .select({ date: writeOffs.date, qty: writeOffs.qty })
      .from(writeOffs)
      .where(
        and(
          orgEq(writeOffs.organizationId, orgId),
          eq(writeOffs.kind, "Ingredient"),
          eq(writeOffs.itemId, ingredientId),
        ),
      ),
  );
  return [
    ...fromSnapshot.map((r) => ({
      date: r.date,
      qty: Number(r.qty),
      conflictKind: "production" as const,
    })),
    ...fromLegacy.map((r) => ({
      date: r.date,
      qty: Number(r.qty),
      conflictKind: "production" as const,
    })),
    ...written.map((r) => ({
      date: r.date,
      qty: Number(r.qty),
      conflictKind: "writeOff" as const,
    })),
  ];
}

async function resaleConsumptionEvents(
  orgId: string,
  productId: string,
): Promise<
  Array<{
    date: string;
    qty: number;
    conflictKind: PurchaseTimelineConflict["conflictKind"];
  }>
> {
  const sold = await qAll(
    db
      .select({ date: sales.date, qty: sales.qty })
      .from(sales)
      .where(
        and(
          orgEq(sales.organizationId, orgId),
          eq(sales.source, "resale"),
          eq(sales.itemId, productId),
        ),
      ),
  );
  const written = await qAll(
    db
      .select({ date: writeOffs.date, qty: writeOffs.qty })
      .from(writeOffs)
      .where(
        and(
          orgEq(writeOffs.organizationId, orgId),
          eq(writeOffs.kind, "Product"),
          eq(writeOffs.itemId, productId),
        ),
      ),
  );
  return [
    ...sold.map((r) => ({
      date: r.date,
      qty: Number(r.qty),
      conflictKind: "sale" as const,
    })),
    ...written.map((r) => ({
      date: r.date,
      qty: Number(r.qty),
      conflictKind: "writeOff" as const,
    })),
  ];
}

/** Validate purchase list vs later usage for one item (after an edit/delete). */
export async function validatePurchaseTimeline(
  orgId: string,
  kind: "Ingredient" | "Product",
  itemId: string,
  purchaseRows: Array<{ date: string; qty: number }>,
): Promise<PurchaseTimelineConflict | null> {
  const outs =
    kind === "Ingredient"
      ? await ingredientConsumptionEvents(orgId, itemId)
      : await resaleConsumptionEvents(orgId, itemId);
  return findPurchaseTimelineConflict(purchaseRows, outs);
}

async function purchaseRowsForItem(
  orgId: string,
  kind: "Ingredient" | "Product",
  itemId: string,
): Promise<Array<{ date: string; qty: number }>> {
  const rows = await qAll(
    db
      .select({ date: purchases.date, qty: purchases.qty })
      .from(purchases)
      .where(
        and(
          orgEq(purchases.organizationId, orgId),
          eq(purchases.kind, kind),
          eq(purchases.itemId, itemId),
        ),
      ),
  );
  return rows.map((r) => ({ date: r.date, qty: Number(r.qty) }));
}

/** Propose consuming an ingredient on a date (production / write-off). */
export async function validateProposedIngredientOut(
  orgId: string,
  ingredientId: string,
  out: {
    date: string;
    qty: number;
    conflictKind: PurchaseTimelineConflict["conflictKind"];
  },
): Promise<PurchaseTimelineConflict | null> {
  const purchasesRows = await purchaseRowsForItem(
    orgId,
    "Ingredient",
    ingredientId,
  );
  const outs = [
    ...(await ingredientConsumptionEvents(orgId, ingredientId)),
    out,
  ];
  return findPurchaseTimelineConflict(purchasesRows, outs);
}

/** Propose consuming a resale product on a date (sale / write-off). */
export async function validateProposedResaleOut(
  orgId: string,
  productId: string,
  out: {
    date: string;
    qty: number;
    conflictKind: PurchaseTimelineConflict["conflictKind"];
  },
): Promise<PurchaseTimelineConflict | null> {
  const purchasesRows = await purchaseRowsForItem(orgId, "Product", productId);
  const outs = [...(await resaleConsumptionEvents(orgId, productId)), out];
  return findPurchaseTimelineConflict(purchasesRows, outs);
}

async function manufacturedProductIns(orgId: string, productId: string) {
  const rows = await qAll(
    db
      .select({ date: productionRuns.date, qty: productionRuns.qty })
      .from(productionRuns)
      .where(
        and(
          orgEq(productionRuns.organizationId, orgId),
          eq(productionRuns.productId, productId),
        ),
      ),
  );
  return rows.map((r) => ({ date: r.date, qty: Number(r.qty) }));
}

async function manufacturedProductOuts(orgId: string, productId: string) {
  const sold = await qAll(
    db
      .select({ date: sales.date, qty: sales.qty })
      .from(sales)
      .where(
        and(
          orgEq(sales.organizationId, orgId),
          eq(sales.source, "manufactured"),
          eq(sales.itemId, productId),
        ),
      ),
  );
  const written = await qAll(
    db
      .select({ date: writeOffs.date, qty: writeOffs.qty })
      .from(writeOffs)
      .where(
        and(
          orgEq(writeOffs.organizationId, orgId),
          eq(writeOffs.kind, "Product"),
          eq(writeOffs.itemId, productId),
        ),
      ),
  );
  return [
    ...sold.map((r) => ({
      date: r.date,
      qty: Number(r.qty),
      conflictKind: "sale" as const,
    })),
    ...written.map((r) => ({
      date: r.date,
      qty: Number(r.qty),
      conflictKind: "writeOff" as const,
    })),
  ];
}

/** Propose selling/writing off a manufactured product on a date. */
export async function validateProposedManufacturedOut(
  orgId: string,
  productId: string,
  out: {
    date: string;
    qty: number;
    conflictKind: PurchaseTimelineConflict["conflictKind"];
  },
): Promise<PurchaseTimelineConflict | null> {
  const ins = await manufacturedProductIns(orgId, productId);
  const outs = [...(await manufacturedProductOuts(orgId, productId)), out];
  return findPurchaseTimelineConflict(ins, outs);
}

async function manufacturedProductOutsExcludingSale(
  orgId: string,
  productId: string,
  excludeSaleId: number,
) {
  const sold = await qAll(
    db
      .select({ id: sales.id, date: sales.date, qty: sales.qty })
      .from(sales)
      .where(
        and(
          orgEq(sales.organizationId, orgId),
          eq(sales.source, "manufactured"),
          eq(sales.itemId, productId),
        ),
      ),
  );
  const written = await qAll(
    db
      .select({ date: writeOffs.date, qty: writeOffs.qty })
      .from(writeOffs)
      .where(
        and(
          orgEq(writeOffs.organizationId, orgId),
          eq(writeOffs.kind, "Product"),
          eq(writeOffs.itemId, productId),
        ),
      ),
  );
  return [
    ...sold
      .filter((r) => r.id !== excludeSaleId)
      .map((r) => ({
        date: r.date,
        qty: Number(r.qty),
        conflictKind: "sale" as const,
      })),
    ...written.map((r) => ({
      date: r.date,
      qty: Number(r.qty),
      conflictKind: "writeOff" as const,
    })),
  ];
}

async function resaleConsumptionEventsExcludingSale(
  orgId: string,
  productId: string,
  excludeSaleId: number,
): Promise<
  Array<{
    date: string;
    qty: number;
    conflictKind: PurchaseTimelineConflict["conflictKind"];
  }>
> {
  const sold = await qAll(
    db
      .select({ id: sales.id, date: sales.date, qty: sales.qty })
      .from(sales)
      .where(
        and(
          orgEq(sales.organizationId, orgId),
          eq(sales.source, "resale"),
          eq(sales.itemId, productId),
        ),
      ),
  );
  const written = await qAll(
    db
      .select({ date: writeOffs.date, qty: writeOffs.qty })
      .from(writeOffs)
      .where(
        and(
          orgEq(writeOffs.organizationId, orgId),
          eq(writeOffs.kind, "Product"),
          eq(writeOffs.itemId, productId),
        ),
      ),
  );
  return [
    ...sold
      .filter((r) => r.id !== excludeSaleId)
      .map((r) => ({
        date: r.date,
        qty: Number(r.qty),
        conflictKind: "sale" as const,
      })),
    ...written.map((r) => ({
      date: r.date,
      qty: Number(r.qty),
      conflictKind: "writeOff" as const,
    })),
  ];
}

/** Validate replacing a sale (exclude old row, apply new fields). */
export async function validateSaleUpdate(
  orgId: string,
  saleId: number,
  next: {
    date: string;
    source: "manufactured" | "resale";
    itemId: string;
    qty: number;
  },
): Promise<
  | { ok: true }
  | {
      ok: false;
      conflict?: PurchaseTimelineConflict;
      stockError?: string;
    }
> {
  const existing = await qGet(
    db
      .select()
      .from(sales)
      .where(and(orgEq(sales.organizationId, orgId), eq(sales.id, saleId))),
  );
  if (!existing) {
    return { ok: false, stockError: "არ მოიძებნა" };
  }

  const sameItem =
    existing.source === next.source && existing.itemId === next.itemId;

  const stock =
    next.source === "manufactured"
      ? await productStock(orgId, next.itemId)
      : await resaleStock(orgId, next.itemId);
  const available = sameItem ? stock + Number(existing.qty) : stock;
  if (available + 1e-9 < next.qty) {
    return {
      ok: false,
      stockError: `არასაკმარისი ნაშთი (არის ${formatQty(available)})`,
    };
  }

  if (sameItem) {
    if (next.source === "manufactured") {
      const ins = await manufacturedProductIns(orgId, next.itemId);
      const outs = [
        ...(await manufacturedProductOutsExcludingSale(
          orgId,
          next.itemId,
          saleId,
        )),
        {
          date: next.date,
          qty: next.qty,
          conflictKind: "sale" as const,
        },
      ];
      const conflict = findPurchaseTimelineConflict(ins, outs);
      if (conflict) return { ok: false, conflict };
    } else {
      const purchasesRows = await purchaseRowsForItem(
        orgId,
        "Product",
        next.itemId,
      );
      const outs = [
        ...(await resaleConsumptionEventsExcludingSale(
          orgId,
          next.itemId,
          saleId,
        )),
        {
          date: next.date,
          qty: next.qty,
          conflictKind: "sale" as const,
        },
      ];
      const conflict = findPurchaseTimelineConflict(purchasesRows, outs);
      if (conflict) return { ok: false, conflict };
    }
  } else {
    const conflict =
      next.source === "manufactured"
        ? await validateProposedManufacturedOut(orgId, next.itemId, {
            date: next.date,
            qty: next.qty,
            conflictKind: "sale",
          })
        : await validateProposedResaleOut(orgId, next.itemId, {
            date: next.date,
            qty: next.qty,
            conflictKind: "sale",
          });
    if (conflict) return { ok: false, conflict };
  }

  return { ok: true };
}

async function ingredientConsumptionEventsExcludingWriteOff(
  orgId: string,
  ingredientId: string,
  excludeWriteOffId: number,
): Promise<
  Array<{
    date: string;
    qty: number;
    conflictKind: PurchaseTimelineConflict["conflictKind"];
  }>
> {
  const events = await ingredientConsumptionEvents(orgId, ingredientId);
  const written = await qAll(
    db
      .select({
        id: writeOffs.id,
        date: writeOffs.date,
        qty: writeOffs.qty,
      })
      .from(writeOffs)
      .where(
        and(
          orgEq(writeOffs.organizationId, orgId),
          eq(writeOffs.kind, "Ingredient"),
          eq(writeOffs.itemId, ingredientId),
        ),
      ),
  );
  const productionOnly = events.filter((e) => e.conflictKind === "production");
  return [
    ...productionOnly,
    ...written
      .filter((r) => r.id !== excludeWriteOffId)
      .map((r) => ({
        date: r.date,
        qty: Number(r.qty),
        conflictKind: "writeOff" as const,
      })),
  ];
}

async function manufacturedProductOutsExcludingWriteOff(
  orgId: string,
  productId: string,
  excludeWriteOffId: number,
) {
  const sold = await qAll(
    db
      .select({ date: sales.date, qty: sales.qty })
      .from(sales)
      .where(
        and(
          orgEq(sales.organizationId, orgId),
          eq(sales.source, "manufactured"),
          eq(sales.itemId, productId),
        ),
      ),
  );
  const written = await qAll(
    db
      .select({
        id: writeOffs.id,
        date: writeOffs.date,
        qty: writeOffs.qty,
      })
      .from(writeOffs)
      .where(
        and(
          orgEq(writeOffs.organizationId, orgId),
          eq(writeOffs.kind, "Product"),
          eq(writeOffs.itemId, productId),
        ),
      ),
  );
  return [
    ...sold.map((r) => ({
      date: r.date,
      qty: Number(r.qty),
      conflictKind: "sale" as const,
    })),
    ...written
      .filter((r) => r.id !== excludeWriteOffId)
      .map((r) => ({
        date: r.date,
        qty: Number(r.qty),
        conflictKind: "writeOff" as const,
      })),
  ];
}

async function resaleConsumptionEventsExcludingWriteOff(
  orgId: string,
  productId: string,
  excludeWriteOffId: number,
): Promise<
  Array<{
    date: string;
    qty: number;
    conflictKind: PurchaseTimelineConflict["conflictKind"];
  }>
> {
  const sold = await qAll(
    db
      .select({ date: sales.date, qty: sales.qty })
      .from(sales)
      .where(
        and(
          orgEq(sales.organizationId, orgId),
          eq(sales.source, "resale"),
          eq(sales.itemId, productId),
        ),
      ),
  );
  const written = await qAll(
    db
      .select({
        id: writeOffs.id,
        date: writeOffs.date,
        qty: writeOffs.qty,
      })
      .from(writeOffs)
      .where(
        and(
          orgEq(writeOffs.organizationId, orgId),
          eq(writeOffs.kind, "Product"),
          eq(writeOffs.itemId, productId),
        ),
      ),
  );
  return [
    ...sold.map((r) => ({
      date: r.date,
      qty: Number(r.qty),
      conflictKind: "sale" as const,
    })),
    ...written
      .filter((r) => r.id !== excludeWriteOffId)
      .map((r) => ({
        date: r.date,
        qty: Number(r.qty),
        conflictKind: "writeOff" as const,
      })),
  ];
}

async function isManufacturedProduct(
  orgId: string,
  itemId: string,
): Promise<boolean> {
  const prod = await qGet(
    db
      .select({ id: products.id })
      .from(products)
      .where(
        and(orgEq(products.organizationId, orgId), eq(products.id, itemId)),
      ),
  );
  return Boolean(prod);
}

/** Validate replacing a write-off (exclude old row, apply new fields). */
export async function validateWriteOffUpdate(
  orgId: string,
  writeOffId: number,
  next: {
    date: string;
    kind: "Ingredient" | "Product";
    itemId: string;
    qty: number;
  },
): Promise<
  | { ok: true }
  | {
      ok: false;
      conflict?: PurchaseTimelineConflict;
      stockError?: string;
    }
> {
  const existing = await qGet(
    db
      .select()
      .from(writeOffs)
      .where(
        and(
          orgEq(writeOffs.organizationId, orgId),
          eq(writeOffs.id, writeOffId),
        ),
      ),
  );
  if (!existing) {
    return { ok: false, stockError: "არ მოიძებნა" };
  }

  const sameItem =
    existing.kind === next.kind && existing.itemId === next.itemId;

  let stock = 0;
  let nextIsManufactured = false;
  if (next.kind === "Ingredient") {
    stock = await ingredientStock(orgId, next.itemId);
  } else {
    nextIsManufactured = await isManufacturedProduct(orgId, next.itemId);
    stock = nextIsManufactured
      ? await productStock(orgId, next.itemId)
      : await resaleStock(orgId, next.itemId);
  }
  const available = sameItem ? stock + Number(existing.qty) : stock;
  if (available + 1e-9 < next.qty) {
    return {
      ok: false,
      stockError: `არასაკმარისი ნაშთი (არის ${formatQty(available)})`,
    };
  }

  if (sameItem) {
    if (next.kind === "Ingredient") {
      const purchasesRows = await purchaseRowsForItem(
        orgId,
        "Ingredient",
        next.itemId,
      );
      const outs = [
        ...(await ingredientConsumptionEventsExcludingWriteOff(
          orgId,
          next.itemId,
          writeOffId,
        )),
        {
          date: next.date,
          qty: next.qty,
          conflictKind: "writeOff" as const,
        },
      ];
      const conflict = findPurchaseTimelineConflict(purchasesRows, outs);
      if (conflict) return { ok: false, conflict };
    } else if (nextIsManufactured) {
      const ins = await manufacturedProductIns(orgId, next.itemId);
      const outs = [
        ...(await manufacturedProductOutsExcludingWriteOff(
          orgId,
          next.itemId,
          writeOffId,
        )),
        {
          date: next.date,
          qty: next.qty,
          conflictKind: "writeOff" as const,
        },
      ];
      const conflict = findPurchaseTimelineConflict(ins, outs);
      if (conflict) return { ok: false, conflict };
    } else {
      const purchasesRows = await purchaseRowsForItem(
        orgId,
        "Product",
        next.itemId,
      );
      const outs = [
        ...(await resaleConsumptionEventsExcludingWriteOff(
          orgId,
          next.itemId,
          writeOffId,
        )),
        {
          date: next.date,
          qty: next.qty,
          conflictKind: "writeOff" as const,
        },
      ];
      const conflict = findPurchaseTimelineConflict(purchasesRows, outs);
      if (conflict) return { ok: false, conflict };
    }
  } else {
    const conflict =
      next.kind === "Ingredient"
        ? await validateProposedIngredientOut(orgId, next.itemId, {
            date: next.date,
            qty: next.qty,
            conflictKind: "writeOff",
          })
        : nextIsManufactured
          ? await validateProposedManufacturedOut(orgId, next.itemId, {
              date: next.date,
              qty: next.qty,
              conflictKind: "writeOff",
            })
          : await validateProposedResaleOut(orgId, next.itemId, {
              date: next.date,
              qty: next.qty,
              conflictKind: "writeOff",
            });
    if (conflict) return { ok: false, conflict };
  }

  return { ok: true };
}

async function manufacturedProductInsExcludingRun(
  orgId: string,
  productId: string,
  excludeRunId: number,
) {
  const rows = await qAll(
    db
      .select({
        id: productionRuns.id,
        date: productionRuns.date,
        qty: productionRuns.qty,
      })
      .from(productionRuns)
      .where(
        and(
          orgEq(productionRuns.organizationId, orgId),
          eq(productionRuns.productId, productId),
        ),
      ),
  );
  return rows
    .filter((r) => r.id !== excludeRunId)
    .map((r) => ({ date: r.date, qty: Number(r.qty) }));
}

/** True if removing this production run would leave manufactured stock negative. */
export async function validateProductionRunRemoval(
  orgId: string,
  productId: string,
  runId: number,
): Promise<PurchaseTimelineConflict | null> {
  const ins = await manufacturedProductInsExcludingRun(
    orgId,
    productId,
    runId,
  );
  const outs = await manufacturedProductOuts(orgId, productId);
  return findPurchaseTimelineConflict(ins, outs);
}

async function ingredientConsumptionEventsExcludingRun(
  orgId: string,
  ingredientId: string,
  excludeRunId: number,
): Promise<
  Array<{
    date: string;
    qty: number;
    conflictKind: PurchaseTimelineConflict["conflictKind"];
  }>
> {
  const fromSnapshot = await qAll(
    db
      .select({
        date: productionRuns.date,
        qty: productionIngredientUsage.qty,
        runId: productionRuns.id,
      })
      .from(productionIngredientUsage)
      .innerJoin(
        productionRuns,
        eq(productionIngredientUsage.runId, productionRuns.id),
      )
      .where(
        and(
          orgEq(productionIngredientUsage.organizationId, orgId),
          eq(productionIngredientUsage.ingredientId, ingredientId),
        ),
      ),
  );
  const fromLegacy = await qAll(
    db
      .select({
        date: productionRuns.date,
        qty: sql<number>`${productionRuns.qty} * ${recipeLines.qty}`,
        runId: productionRuns.id,
      })
      .from(productionRuns)
      .innerJoin(
        recipeLines,
        and(
          eq(recipeLines.productId, productionRuns.productId),
          eq(recipeLines.organizationId, productionRuns.organizationId),
        ),
      )
      .where(
        and(
          orgEq(productionRuns.organizationId, orgId),
          eq(recipeLines.ingredientId, ingredientId),
          sql`NOT EXISTS (SELECT 1 FROM production_ingredient_usage u WHERE u.run_id = ${productionRuns.id})`,
        ),
      ),
  );
  const written = await qAll(
    db
      .select({ date: writeOffs.date, qty: writeOffs.qty })
      .from(writeOffs)
      .where(
        and(
          orgEq(writeOffs.organizationId, orgId),
          eq(writeOffs.kind, "Ingredient"),
          eq(writeOffs.itemId, ingredientId),
        ),
      ),
  );
  return [
    ...fromSnapshot
      .filter((r) => r.runId !== excludeRunId)
      .map((r) => ({
        date: r.date,
        qty: Number(r.qty),
        conflictKind: "production" as const,
      })),
    ...fromLegacy
      .filter((r) => r.runId !== excludeRunId)
      .map((r) => ({
        date: r.date,
        qty: Number(r.qty),
        conflictKind: "production" as const,
      })),
    ...written.map((r) => ({
      date: r.date,
      qty: Number(r.qty),
      conflictKind: "writeOff" as const,
    })),
  ];
}

export async function runIngredientUsageQty(
  orgId: string,
  runId: number,
  ingredientId: string,
): Promise<number> {
  const snap = await qGet(
    db
      .select({
        qty: sql<number>`coalesce(sum(${productionIngredientUsage.qty}), 0)`,
      })
      .from(productionIngredientUsage)
      .where(
        and(
          orgEq(productionIngredientUsage.organizationId, orgId),
          eq(productionIngredientUsage.runId, runId),
          eq(productionIngredientUsage.ingredientId, ingredientId),
        ),
      ),
  );
  if (snap && Number(snap.qty) > 0) return Number(snap.qty);

  const run = await qGet(
    db
      .select()
      .from(productionRuns)
      .where(
        and(
          orgEq(productionRuns.organizationId, orgId),
          eq(productionRuns.id, runId),
        ),
      ),
  );
  if (!run) return 0;
  const line = await qGet(
    db
      .select()
      .from(recipeLines)
      .where(
        and(
          orgEq(recipeLines.organizationId, orgId),
          eq(recipeLines.productId, run.productId),
          eq(recipeLines.ingredientId, ingredientId),
        ),
      ),
  );
  return line ? Number(run.qty) * Number(line.qty) : 0;
}

/** Validate replacing a production run (exclude old run, apply new fields). */
export async function validateProductionRunUpdate(
  orgId: string,
  runId: number,
  next: { date: string; productId: string; qty: number },
): Promise<
  | { ok: true }
  | {
      ok: false;
      conflict?: PurchaseTimelineConflict;
      stockError?: string;
    }
> {
  const existing = await qGet(
    db
      .select()
      .from(productionRuns)
      .where(
        and(
          orgEq(productionRuns.organizationId, orgId),
          eq(productionRuns.id, runId),
        ),
      ),
  );
  if (!existing) {
    return { ok: false, stockError: "არ მოიძებნა" };
  }

  const lines = await qAll(
    db
      .select()
      .from(recipeLines)
      .where(
        and(
          orgEq(recipeLines.organizationId, orgId),
          eq(recipeLines.productId, next.productId),
        ),
      ),
  );
  const activeLines = lines.filter((line) => Number(line.qty) > 1e-12);
  if (activeLines.length === 0) {
    return { ok: false, stockError: "შემადგენლობა არ არის" };
  }

  for (const line of activeLines) {
    const need = line.qty * next.qty;
    const oldUsage = await runIngredientUsageQty(
      orgId,
      runId,
      line.ingredientId,
    );
    const have = (await ingredientStock(orgId, line.ingredientId)) + oldUsage;
    if (have + 1e-9 < need) {
      return {
        ok: false,
        stockError: `არასაკმარისი ნაშთი: ${line.ingredientId} (სჭირდება ${formatQty(need)}, არის ${formatQty(have)})`,
      };
    }
    const purchasesRows = await purchaseRowsForItem(
      orgId,
      "Ingredient",
      line.ingredientId,
    );
    const outs = [
      ...(await ingredientConsumptionEventsExcludingRun(
        orgId,
        line.ingredientId,
        runId,
      )),
      {
        date: next.date,
        qty: need,
        conflictKind: "production" as const,
      },
    ];
    const conflict = findPurchaseTimelineConflict(purchasesRows, outs);
    if (conflict) return { ok: false, conflict };
  }

  // Manufactured product timeline: remove old run, add updated run.
  const productsToCheck = new Set([existing.productId, next.productId]);
  for (const productId of productsToCheck) {
    const ins = await manufacturedProductInsExcludingRun(
      orgId,
      productId,
      runId,
    );
    if (productId === next.productId) {
      ins.push({ date: next.date, qty: next.qty });
    }
    const outs = await manufacturedProductOuts(orgId, productId);
    const conflict = findPurchaseTimelineConflict(ins, outs);
    if (conflict) return { ok: false, conflict };
  }

  return { ok: true };
}

/**
 * After ingredient purchase edits, rewrite production run cost snapshots for
 * every product that uses that ingredient so P&L / product costs stay in sync.
 */
export async function refreshProductionCostsForIngredient(
  orgId: string,
  ingredientId: string,
): Promise<void> {
  const fromRecipe = await qAll(
    db
      .select({ productId: recipeLines.productId })
      .from(recipeLines)
      .where(
        and(
          orgEq(recipeLines.organizationId, orgId),
          eq(recipeLines.ingredientId, ingredientId),
        ),
      ),
  );
  const fromUsage = await qAll(
    db
      .select({ productId: productionRuns.productId })
      .from(productionIngredientUsage)
      .innerJoin(
        productionRuns,
        eq(productionIngredientUsage.runId, productionRuns.id),
      )
      .where(
        and(
          orgEq(productionIngredientUsage.organizationId, orgId),
          eq(productionIngredientUsage.ingredientId, ingredientId),
        ),
      ),
  );
  const productIds = [
    ...new Set(
      [...fromRecipe, ...fromUsage]
        .map((r) => r.productId)
        .filter(Boolean),
    ),
  ];
  for (const productId of productIds) {
    const snap = await recipeUnitCost(orgId, productId);
    await qRun(
      db
        .update(productionRuns)
        .set({ ingredientUnitCost: snap })
        .where(
          and(
            orgEq(productionRuns.organizationId, orgId),
            eq(productionRuns.productId, productId),
          ),
        ),
    );
  }
}

export async function ingredientStock(
  orgId: string,
  ingredientId: string,
): Promise<number> {
  const bought =
    (
      await qGet(
        db
          .select({ q: sql<number>`coalesce(sum(${purchases.qty}), 0)` })
          .from(purchases)
          .where(
            and(
              orgEq(purchases.organizationId, orgId),
              eq(purchases.kind, "Ingredient"),
              eq(purchases.itemId, ingredientId),
            ),
          ),
      )
    )?.q ?? 0;
  const usedInProd = await ingredientUsedInProduction(orgId, ingredientId);
  const written =
    (
      await qGet(
        db
          .select({ q: sql<number>`coalesce(sum(${writeOffs.qty}), 0)` })
          .from(writeOffs)
          .where(
            and(
              orgEq(writeOffs.organizationId, orgId),
              eq(writeOffs.kind, "Ingredient"),
              eq(writeOffs.itemId, ingredientId),
            ),
          ),
      )
    )?.q ?? 0;
  return bought - usedInProd - written;
}

/** Batch-enrich ingredients list — few GROUP BY queries instead of N×8 round-trips. */
export async function ingredientsListEnriched(orgId: string) {
  const rows = await qAll(
    db
      .select()
      .from(ingredients)
      .where(eq(ingredients.organizationId, orgId))
      .orderBy(ingredients.name),
  );
  if (rows.length === 0) return [];

  const [
    purchaseStats,
    usageSnap,
    usageLegacy,
    writeOffStats,
    purchaseIds,
    writeOffIds,
    recipeIds,
    usageIds,
  ] = await Promise.all([
    qAll(
      db
        .select({
          itemId: purchases.itemId,
          qty: sql<number>`coalesce(sum(${purchases.qty}), 0)`,
          total: sql<number>`coalesce(sum(${purchases.total}), 0)`,
          lastDate: sql<string | null>`max(${purchases.date})`,
        })
        .from(purchases)
        .where(
          and(
            orgEq(purchases.organizationId, orgId),
            eq(purchases.kind, "Ingredient"),
          ),
        )
        .groupBy(purchases.itemId),
    ),
    qAll(
      db
        .select({
          ingredientId: productionIngredientUsage.ingredientId,
          qty: sql<number>`coalesce(sum(${productionIngredientUsage.qty}), 0)`,
        })
        .from(productionIngredientUsage)
        .where(orgEq(productionIngredientUsage.organizationId, orgId))
        .groupBy(productionIngredientUsage.ingredientId),
    ),
    qAll(
      db
        .select({
          ingredientId: recipeLines.ingredientId,
          qty: sql<number>`coalesce(sum(${productionRuns.qty} * ${recipeLines.qty}), 0)`,
        })
        .from(productionRuns)
        .innerJoin(
          recipeLines,
          and(
            eq(recipeLines.productId, productionRuns.productId),
            eq(recipeLines.organizationId, productionRuns.organizationId),
          ),
        )
        .where(
          and(
            orgEq(productionRuns.organizationId, orgId),
            sql`NOT EXISTS (SELECT 1 FROM production_ingredient_usage u WHERE u.run_id = ${productionRuns.id})`,
          ),
        )
        .groupBy(recipeLines.ingredientId),
    ),
    qAll(
      db
        .select({
          itemId: writeOffs.itemId,
          qty: sql<number>`coalesce(sum(${writeOffs.qty}), 0)`,
        })
        .from(writeOffs)
        .where(
          and(
            orgEq(writeOffs.organizationId, orgId),
            eq(writeOffs.kind, "Ingredient"),
          ),
        )
        .groupBy(writeOffs.itemId),
    ),
    qAll(
      db
        .select({ itemId: purchases.itemId })
        .from(purchases)
        .where(
          and(
            orgEq(purchases.organizationId, orgId),
            eq(purchases.kind, "Ingredient"),
          ),
        )
        .groupBy(purchases.itemId),
    ),
    qAll(
      db
        .select({ itemId: writeOffs.itemId })
        .from(writeOffs)
        .where(
          and(
            orgEq(writeOffs.organizationId, orgId),
            eq(writeOffs.kind, "Ingredient"),
          ),
        )
        .groupBy(writeOffs.itemId),
    ),
    qAll(
      db
        .select({ ingredientId: recipeLines.ingredientId })
        .from(recipeLines)
        .where(orgEq(recipeLines.organizationId, orgId))
        .groupBy(recipeLines.ingredientId),
    ),
    qAll(
      db
        .select({ ingredientId: productionIngredientUsage.ingredientId })
        .from(productionIngredientUsage)
        .where(orgEq(productionIngredientUsage.organizationId, orgId))
        .groupBy(productionIngredientUsage.ingredientId),
    ),
  ]);

  const bought = new Map(
    purchaseStats.map((r) => [
      r.itemId,
      {
        qty: Number(r.qty),
        total: Number(r.total),
        lastDate: r.lastDate,
      },
    ]),
  );
  const used = new Map<string, number>();
  for (const r of usageSnap) {
    used.set(r.ingredientId, (used.get(r.ingredientId) ?? 0) + Number(r.qty));
  }
  for (const r of usageLegacy) {
    used.set(r.ingredientId, (used.get(r.ingredientId) ?? 0) + Number(r.qty));
  }
  const written = new Map(
    writeOffStats.map((r) => [r.itemId, Number(r.qty)]),
  );
  const hasOps = new Set<string>([
    ...purchaseIds.map((r) => r.itemId),
    ...writeOffIds.map((r) => r.itemId),
    ...recipeIds.map((r) => r.ingredientId),
    ...usageIds.map((r) => r.ingredientId),
  ]);

  return rows.map((r) => {
    const p = bought.get(r.id);
    const avgCost = p && p.qty ? p.total / p.qty : 0;
    const stock = (p?.qty ?? 0) - (used.get(r.id) ?? 0) - (written.get(r.id) ?? 0);
    return {
      ...r,
      avgCost,
      stock,
      lastPurchaseDate: p?.lastDate ?? null,
      canDelete: !hasOps.has(r.id),
    };
  });
}

/** Batch-enrich resale list. */
export async function resaleListEnriched(orgId: string) {
  const rows = await qAll(
    db
      .select()
      .from(resaleProducts)
      .where(eq(resaleProducts.organizationId, orgId))
      .orderBy(resaleProducts.name),
  );
  if (rows.length === 0) return [];

  const [purchaseStats, salesStats, writeOffStats] = await Promise.all([
    qAll(
      db
        .select({
          itemId: purchases.itemId,
          qty: sql<number>`coalesce(sum(${purchases.qty}), 0)`,
          total: sql<number>`coalesce(sum(${purchases.total}), 0)`,
          lastDate: sql<string | null>`max(${purchases.date})`,
        })
        .from(purchases)
        .where(
          and(
            orgEq(purchases.organizationId, orgId),
            eq(purchases.kind, "Product"),
          ),
        )
        .groupBy(purchases.itemId),
    ),
    qAll(
      db
        .select({
          itemId: sales.itemId,
          qty: sql<number>`coalesce(sum(${sales.qty}), 0)`,
        })
        .from(sales)
        .where(
          and(orgEq(sales.organizationId, orgId), eq(sales.source, "resale")),
        )
        .groupBy(sales.itemId),
    ),
    qAll(
      db
        .select({
          itemId: writeOffs.itemId,
          qty: sql<number>`coalesce(sum(${writeOffs.qty}), 0)`,
        })
        .from(writeOffs)
        .where(
          and(
            orgEq(writeOffs.organizationId, orgId),
            eq(writeOffs.kind, "Product"),
          ),
        )
        .groupBy(writeOffs.itemId),
    ),
  ]);

  const bought = new Map(
    purchaseStats.map((r) => [
      r.itemId,
      {
        qty: Number(r.qty),
        total: Number(r.total),
        lastDate: r.lastDate,
      },
    ]),
  );
  const sold = new Map(salesStats.map((r) => [r.itemId, Number(r.qty)]));
  const written = new Map(writeOffStats.map((r) => [r.itemId, Number(r.qty)]));
  const hasOps = new Set([
    ...bought.keys(),
    ...sold.keys(),
    ...written.keys(),
  ]);

  return rows.map((r) => {
    const p = bought.get(r.id);
    const unitCost = p && p.qty ? p.total / p.qty : 0;
    const stock =
      (p?.qty ?? 0) - (sold.get(r.id) ?? 0) - (written.get(r.id) ?? 0);
    return {
      ...r,
      unitCost,
      stock,
      stockValue: stock * unitCost,
      lastPurchaseDate: p?.lastDate ?? null,
      canDelete: !hasOps.has(r.id),
    };
  });
}

/** Batch-enrich manufactured products list via shared PlComputeCache. */
export async function productsListEnriched(orgId: string) {
  const rows = await qAll(
    db
      .select()
      .from(products)
      .where(eq(products.organizationId, orgId))
      .orderBy(products.name),
  );
  if (rows.length === 0) return [];

  const cache = new PlComputeCache(orgId);
  await cache.warmListCosts();
  await Promise.all(rows.map((r) => cache.productFullUnitCostCached(r.id)));

  const [runIds, saleIds, writeOffIds] = await Promise.all([
    qAll(
      db
        .select({ productId: productionRuns.productId })
        .from(productionRuns)
        .where(orgEq(productionRuns.organizationId, orgId))
        .groupBy(productionRuns.productId),
    ),
    qAll(
      db
        .select({ itemId: sales.itemId })
        .from(sales)
        .where(
          and(
            orgEq(sales.organizationId, orgId),
            eq(sales.source, "manufactured"),
          ),
        )
        .groupBy(sales.itemId),
    ),
    qAll(
      db
        .select({ itemId: writeOffs.itemId })
        .from(writeOffs)
        .where(
          and(
            orgEq(writeOffs.organizationId, orgId),
            eq(writeOffs.kind, "Product"),
          ),
        )
        .groupBy(writeOffs.itemId),
    ),
  ]);
  const hasOps = new Set<string>([
    ...runIds.map((r) => r.productId),
    ...saleIds.map((r) => r.itemId),
    ...writeOffIds.map((r) => r.itemId),
  ]);

  return Promise.all(
    rows.map(async (r) => {
      const qtyIn = await cache.productQtyInCached(r.id);
      const ingUnit = await cache.productIngredientUnitCostCached(r.id);
      const ohUnit = await cache.productOverheadUnitCostCached(r.id);
      const fullUnit = await cache.productFullUnitCostCached(r.id);
      const stock = await cache.productStockCached(r.id);
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
        canDelete: !hasOps.has(r.id),
      };
    }),
  );
}

/** Batch-enrich production runs list. */
export async function productionListEnriched(orgId: string) {
  const rows = await qAll(
    db
      .select()
      .from(productionRuns)
      .where(eq(productionRuns.organizationId, orgId))
      .orderBy(desc(productionRuns.date)),
  );
  const names = Object.fromEntries(
    (
      await qAll(
        db.select().from(products).where(eq(products.organizationId, orgId)),
      )
    ).map((p) => [p.id, p.name]),
  );
  if (rows.length === 0) {
    return [];
  }

  const cache = new PlComputeCache(orgId);
  await cache.warmListCosts();

  return Promise.all(
    rows.map(async (r) => {
      const unitSnap =
        r.ingredientUnitCost > 0
          ? r.ingredientUnitCost
          : await cache.recipeUnitCostCached(r.productId);
      const ingTotal = await cache.runIngredientTotalCached(r);
      const ohTotal = await cache.runOverheadTotalCached(r);
      return {
        ...r,
        productName: names[r.productId] ?? r.productId,
        unitCost: unitSnap,
        ingredientCost: ingTotal,
        overheadCost: ohTotal,
        fullCost: ingTotal + ohTotal,
      };
    }),
  );
}

/** Snapshotted usage rows + legacy recipe fallback for runs without snapshots. */
async function ingredientUsedInProduction(
  orgId: string,
  ingredientId: string,
): Promise<number> {
  const fromSnapshot =
    (
      await qGet(
        db
          .select({
            q: sql<number>`coalesce(sum(${productionIngredientUsage.qty}), 0)`,
          })
          .from(productionIngredientUsage)
          .where(
            and(
              orgEq(productionIngredientUsage.organizationId, orgId),
              eq(productionIngredientUsage.ingredientId, ingredientId),
            ),
          ),
      )
    )?.q ?? 0;
  const fromLegacy =
    (
      await qGet(
        db
          .select({
            q: sql<number>`coalesce(sum(${productionRuns.qty} * ${recipeLines.qty}), 0)`,
          })
          .from(productionRuns)
          .innerJoin(
            recipeLines,
            and(
              eq(recipeLines.productId, productionRuns.productId),
              eq(recipeLines.organizationId, productionRuns.organizationId),
            ),
          )
          .where(
            and(
              orgEq(productionRuns.organizationId, orgId),
              eq(recipeLines.ingredientId, ingredientId),
              sql`NOT EXISTS (SELECT 1 FROM production_ingredient_usage u WHERE u.run_id = ${productionRuns.id})`,
            ),
          ),
      )
    )?.q ?? 0;
  return fromSnapshot + fromLegacy;
}

/** True if this ingredient was consumed for this product in any production run. */
export async function recipeIngredientUsedInProduction(
  orgId: string,
  productId: string,
  ingredientId: string,
): Promise<boolean> {
  const snap = await qGet(
    db
      .select({ id: productionIngredientUsage.id })
      .from(productionIngredientUsage)
      .innerJoin(
        productionRuns,
        eq(productionIngredientUsage.runId, productionRuns.id),
      )
      .where(
        and(
          orgEq(productionIngredientUsage.organizationId, orgId),
          eq(productionIngredientUsage.ingredientId, ingredientId),
          eq(productionRuns.productId, productId),
        ),
      )
      .limit(1),
  );
  if (snap) return true;

  // Runs with no usage snapshots still deduct via live recipe join.
  const legacy = await qGet(
    db
      .select({ id: productionRuns.id })
      .from(productionRuns)
      .innerJoin(
        recipeLines,
        and(
          eq(recipeLines.productId, productionRuns.productId),
          eq(recipeLines.organizationId, productionRuns.organizationId),
          eq(recipeLines.ingredientId, ingredientId),
        ),
      )
      .where(
        and(
          orgEq(productionRuns.organizationId, orgId),
          eq(productionRuns.productId, productId),
          sql`NOT EXISTS (SELECT 1 FROM production_ingredient_usage u WHERE u.run_id = ${productionRuns.id})`,
        ),
      )
      .limit(1),
  );
  return !!legacy;
}

/** One-time/idempotent: snapshot recipe usage for runs created before usage table. */
export async function backfillProductionIngredientUsage() {
  const runs = await qAll(
    db
      .select({
        id: productionRuns.id,
        organizationId: productionRuns.organizationId,
        productId: productionRuns.productId,
        qty: productionRuns.qty,
      })
      .from(productionRuns),
  );
  for (const run of runs) {
    const existing = await qGet(
      db
        .select({ id: productionIngredientUsage.id })
        .from(productionIngredientUsage)
        .where(eq(productionIngredientUsage.runId, run.id))
        .limit(1),
    );
    if (existing) continue;
    const lines = await qAll(
      db
        .select()
        .from(recipeLines)
        .where(
          and(
            orgEq(recipeLines.organizationId, run.organizationId),
            eq(recipeLines.productId, run.productId),
          ),
        ),
    );
    for (const line of lines) {
      await qRun(
        db.insert(productionIngredientUsage).values({
          organizationId: run.organizationId,
          runId: run.id,
          ingredientId: line.ingredientId,
          qty: line.qty * run.qty,
        }),
      );
    }
  }
}
export async function lastPurchaseDate(
  orgId: string,
  ingredientId: string,
): Promise<string | null> {
  const row = await qGet(
    db
      .select({ d: purchases.date })
      .from(purchases)
      .where(
        and(
          orgEq(purchases.organizationId, orgId),
          eq(purchases.kind, "Ingredient"),
          eq(purchases.itemId, ingredientId),
        ),
      )
      .orderBy(desc(purchases.date))
      .limit(1),
  );
  return row?.d ?? null;
}

export async function lastResalePurchaseDate(
  orgId: string,
  productId: string,
): Promise<string | null> {
  const row = await qGet(
    db
      .select({ d: purchases.date })
      .from(purchases)
      .where(
        and(
          orgEq(purchases.organizationId, orgId),
          eq(purchases.kind, "Product"),
          eq(purchases.itemId, productId),
        ),
      )
      .orderBy(desc(purchases.date))
      .limit(1),
  );
  return row?.d ?? null;
}
export async function productQtyIn(
  orgId: string,
  productId: string,
): Promise<number> {
  return (
    (
      await qGet(
        db
          .select({ q: sql<number>`coalesce(sum(${productionRuns.qty}), 0)` })
          .from(productionRuns)
          .where(
            and(
              orgEq(productionRuns.organizationId, orgId),
              eq(productionRuns.productId, productId),
            ),
          ),
      )
    )?.q ?? 0
  );
}
export async function productStock(
  orgId: string,
  productId: string,
): Promise<number> {
  const made = await productQtyIn(orgId, productId);
  const sold =
    (
      await qGet(
        db
          .select({ q: sql<number>`coalesce(sum(${sales.qty}), 0)` })
          .from(sales)
          .where(
            and(
              orgEq(sales.organizationId, orgId),
              eq(sales.source, "manufactured"),
              eq(sales.itemId, productId),
            ),
          ),
      )
    )?.q ?? 0;
  const written =
    (
      await qGet(
        db
          .select({ q: sql<number>`coalesce(sum(${writeOffs.qty}), 0)` })
          .from(writeOffs)
          .where(
            and(
              orgEq(writeOffs.organizationId, orgId),
              eq(writeOffs.kind, "Product"),
              eq(writeOffs.itemId, productId),
            ),
          ),
      )
    )?.q ?? 0;
  return made - sold - written;
}
export async function resaleStock(
  orgId: string,
  productId: string,
): Promise<number> {
  const bought =
    (
      await qGet(
        db
          .select({ q: sql<number>`coalesce(sum(${purchases.qty}), 0)` })
          .from(purchases)
          .where(
            and(
              orgEq(purchases.organizationId, orgId),
              eq(purchases.kind, "Product"),
              eq(purchases.itemId, productId),
            ),
          ),
      )
    )?.q ?? 0;
  const sold =
    (
      await qGet(
        db
          .select({ q: sql<number>`coalesce(sum(${sales.qty}), 0)` })
          .from(sales)
          .where(
            and(
              orgEq(sales.organizationId, orgId),
              eq(sales.source, "resale"),
              eq(sales.itemId, productId),
            ),
          ),
      )
    )?.q ?? 0;
  const written =
    (
      await qGet(
        db
          .select({ q: sql<number>`coalesce(sum(${writeOffs.qty}), 0)` })
          .from(writeOffs)
          .where(
            and(
              orgEq(writeOffs.organizationId, orgId),
              eq(writeOffs.kind, "Product"),
              eq(writeOffs.itemId, productId),
            ),
          ),
      )
    )?.q ?? 0;
  return bought - sold - written;
}
export async function avgResaleCost(
  orgId: string,
  productId: string,
): Promise<number> {
  const row = await qGet(
    db
      .select({
        total: sql<number>`coalesce(sum(${purchases.total}), 0)`,
        qty: sql<number>`coalesce(sum(${purchases.qty}), 0)`,
      })
      .from(purchases)
      .where(
        and(
          orgEq(purchases.organizationId, orgId),
          eq(purchases.kind, "Product"),
          eq(purchases.itemId, productId),
        ),
      ),
  );
  if (!row || !row.qty) return 0;
  return row.total / row.qty;
}
function daysInMonth(isoDate: string): number {
  const d = new Date(isoDate + "T00:00:00");
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
function monthBounds(isoDate: string): {
  start: string;
  end: string;
} {
  const d = new Date(isoDate + "T00:00:00");
  const y = d.getFullYear();
  const m = d.getMonth();
  const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const next = m === 11 ? new Date(y + 1, 0, 1) : new Date(y, m + 1, 1);
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
  return { start, end };
}
/** Excel DailyPoolFormula. */
export async function dailyPool(orgId: string, date: string): Promise<number> {
  const pay =
    (
      await qGet(
        db
          .select({ a: sql<number>`coalesce(sum(${payroll.amount}), 0)` })
          .from(payroll)
          .where(
            and(orgEq(payroll.organizationId, orgId), eq(payroll.date, date)),
          ),
      )
    )?.a ?? 0;
  const other =
    (
      await qGet(
        db
          .select({ a: sql<number>`coalesce(sum(${expenses.gel}), 0)` })
          .from(expenses)
          .where(
            and(
              orgEq(expenses.organizationId, orgId),
              eq(expenses.date, date),
              sql`${expenses.type} NOT IN ('იჯარა', 'ქირა', 'კომუნალური', 'ხელფასი')`,
            ),
          ),
      )
    )?.a ?? 0;
  const { start, end } = monthBounds(date);
  const rentUtil =
    (
      await qGet(
        db
          .select({ a: sql<number>`coalesce(sum(${expenses.gel}), 0)` })
          .from(expenses)
          .where(
            and(
              orgEq(expenses.organizationId, orgId),
              gte(expenses.date, start),
              lt(expenses.date, end),
              sql`${expenses.type} IN ('იჯარა', 'ქირა', 'კომუნალური')`,
            ),
          ),
      )
    )?.a ?? 0;
  return pay + other + rentUtil / daysInMonth(date);
}
/** Excel run G = qty × snapshotted F (fallback to live recipe). */
export async function runIngredientTotal(
  orgId: string,
  run: {
    productId: string;
    qty: number;
    ingredientUnitCost?: number | null;
  },
): Promise<number> {
  const unit =
    run.ingredientUnitCost && run.ingredientUnitCost > 0
      ? run.ingredientUnitCost
      : await recipeUnitCost(orgId, run.productId);
  return unit * run.qty;
}
/**
 * Excel: OH for a run = DailyPool(date) * G / SUMIF(same date, G)
 */
export async function runOverheadTotal(
  orgId: string,
  date: string,
  productId: string,
  qty: number,
  runId?: number,
): Promise<number> {
  const pool = await dailyPool(orgId, date);
  const runs = await qAll(
    db
      .select()
      .from(productionRuns)
      .where(
        and(
          orgEq(productionRuns.organizationId, orgId),
          eq(productionRuns.date, date),
        ),
      ),
  );
  let dayG = 0;
  let thisG = 0;
  for (const r of runs) {
    const g = await runIngredientTotal(orgId, r);
    dayG += g;
    if (runId != null && r.id === runId) thisG = g;
    else if (
      runId == null &&
      r.productId === productId &&
      Math.abs(r.qty - qty) < 1e-9
    )
      thisG = g;
  }
  if (thisG <= 0) {
    thisG = await runIngredientTotal(orgId, {
      productId,
      qty,
      ingredientUnitCost: await recipeUnitCost(orgId, productId),
    });
  }
  const existing = runs.some(
    (r) =>
      r.id === runId ||
      (r.productId === productId && Math.abs(r.qty - qty) < 1e-9),
  );
  if (!existing) dayG += thisG;
  if (dayG <= 0) return 0;
  return pool * (thisG / dayG);
}

type ProductionRunRow = {
  id: number;
  date: string;
  productId: string;
  qty: number;
  ingredientUnitCost?: number | null;
};

/** Request-scoped cache — P&L must not re-query Neon per sale/run. */
export class PlComputeCache {
  private allRuns: ProductionRunRow[] | null = null;
  private runsByDate = new Map<string, ProductionRunRow[]>();
  private runsByProduct = new Map<string, ProductionRunRow[]>();
  private dailyPools = new Map<string, number>();
  private dayGTotals = new Map<string, number>();
  private recipeUnits = new Map<string, number>();
  private ingredientAvgs = new Map<string, number>();
  private resaleAvgs = new Map<string, number>();
  private productFulls = new Map<string, number>();
  private qtyInMap = new Map<string, number>();
  private payrollRows: Array<{ date: string; amount: number }> | null = null;
  private expenseRows: Array<{ date: string; type: string; gel: number }> | null =
    null;
  private recipeByProduct = new Map<
    string,
    Array<{ ingredientId: string; qty: number }>
  >();
  private purchaseAvgsReady = false;
  private recipeLinesReady = false;
  private stockMapsReady = false;
  private soldManufactured = new Map<string, number>();
  private writtenProducts = new Map<string, number>();

  private orgId: string;

  constructor(orgId: string) {
    this.orgId = orgId;
  }

  async ensureRuns() {
    if (this.allRuns) return;
    this.allRuns = await qAll(
      db
        .select({
          id: productionRuns.id,
          date: productionRuns.date,
          productId: productionRuns.productId,
          qty: productionRuns.qty,
          ingredientUnitCost: productionRuns.ingredientUnitCost,
        })
        .from(productionRuns)
        .where(orgEq(productionRuns.organizationId, this.orgId)),
    );
    for (const run of this.allRuns) {
      const byDate = this.runsByDate.get(run.date) ?? [];
      byDate.push(run);
      this.runsByDate.set(run.date, byDate);
      const byProduct = this.runsByProduct.get(run.productId) ?? [];
      byProduct.push(run);
      this.runsByProduct.set(run.productId, byProduct);
    }
  }

  async recipeUnitCostCached(productId: string) {
    const hit = this.recipeUnits.get(productId);
    if (hit !== undefined) return hit;
    await this.ensureRecipeLines();
    const lines = this.recipeByProduct.get(productId) ?? [];
    let total = 0;
    for (const line of lines) {
      const ingCost = this.ingredientAvgs.get(line.ingredientId);
      total +=
        line.qty *
        (ingCost !== undefined
          ? ingCost
          : await this.avgIngredientCostCached(line.ingredientId));
    }
    this.recipeUnits.set(productId, total);
    return total;
  }

  async avgIngredientCostCached(ingredientId: string) {
    const hit = this.ingredientAvgs.get(ingredientId);
    if (hit !== undefined) return hit;
    const v = await avgIngredientCost(this.orgId, ingredientId);
    this.ingredientAvgs.set(ingredientId, v);
    return v;
  }

  async avgResaleCostCached(resaleId: string) {
    const hit = this.resaleAvgs.get(resaleId);
    if (hit !== undefined) return hit;
    const v = await avgResaleCost(this.orgId, resaleId);
    this.resaleAvgs.set(resaleId, v);
    return v;
  }

  async dailyPoolCached(date: string) {
    const hit = this.dailyPools.get(date);
    if (hit !== undefined) return hit;
    const v = await this.computeDailyPool(date);
    this.dailyPools.set(date, v);
    return v;
  }

  private async ensureOverheadRows() {
    if (this.payrollRows && this.expenseRows) return;
    this.payrollRows = await qAll(
      db
        .select({ date: payroll.date, amount: payroll.amount })
        .from(payroll)
        .where(orgEq(payroll.organizationId, this.orgId)),
    );
    this.expenseRows = await qAll(
      db
        .select({
          date: expenses.date,
          type: expenses.type,
          gel: expenses.gel,
        })
        .from(expenses)
        .where(orgEq(expenses.organizationId, this.orgId)),
    );
  }

  private async computeDailyPool(date: string) {
    await this.ensureOverheadRows();
    const pay = this.payrollRows!.reduce(
      (sum, row) => (row.date === date ? sum + row.amount : sum),
      0,
    );
    const other = this.expenseRows!.reduce(
      (sum, row) =>
        row.date === date &&
        !["იჯარა", "ქირა", "კომუნალური", "ხელფასი"].includes(row.type)
          ? sum + row.gel
          : sum,
      0,
    );
    const { start, end } = monthBounds(date);
    const rentUtil = this.expenseRows!.reduce(
      (sum, row) =>
        row.date >= start &&
        row.date < end &&
        ["იჯარა", "ქირა", "კომუნალური"].includes(row.type)
          ? sum + row.gel
          : sum,
      0,
    );
    return pay + other + rentUtil / daysInMonth(date);
  }

  async runIngredientTotalCached(
    run: {
      productId: string;
      qty: number;
      ingredientUnitCost?: number | null;
    },
  ) {
    const unit =
      run.ingredientUnitCost && run.ingredientUnitCost > 0
        ? run.ingredientUnitCost
        : await this.recipeUnitCostCached(run.productId);
    return unit * run.qty;
  }

  async dayGTotal(date: string) {
    const hit = this.dayGTotals.get(date);
    if (hit !== undefined) return hit;
    await this.ensureRuns();
    const runs = this.runsByDate.get(date) ?? [];
    let total = 0;
    for (const run of runs) {
      total += await this.runIngredientTotalCached(run);
    }
    this.dayGTotals.set(date, total);
    return total;
  }

  async runOverheadTotalCached(run: ProductionRunRow) {
    const pool = await this.dailyPoolCached(run.date);
    const dayG = await this.dayGTotal(run.date);
    const thisG = await this.runIngredientTotalCached(run);
    if (dayG <= 0) return 0;
    return pool * (thisG / dayG);
  }

  async productQtyInCached(productId: string) {
    const hit = this.qtyInMap.get(productId);
    if (hit !== undefined) return hit;
    await this.ensureRuns();
    // Excel qtyIn = total produced (sum of runs), not stock on hand.
    const made = (this.runsByProduct.get(productId) ?? []).reduce(
      (sum, run) => sum + run.qty,
      0,
    );
    this.qtyInMap.set(productId, made);
    return made;
  }

  async productIngredientUnitCostCached(productId: string) {
    await this.ensureRuns();
    const qtyIn = await this.productQtyInCached(productId);
    const recipe = await this.recipeUnitCostCached(productId);
    if (qtyIn <= 0) return recipe;
    const runs = this.runsByProduct.get(productId) ?? [];
    let sumG = 0;
    for (const run of runs) sumG += await this.runIngredientTotalCached(run);
    return sumG / qtyIn;
  }

  async productOverheadUnitCostCached(productId: string) {
    await this.ensureRuns();
    const qtyIn = await this.productQtyInCached(productId);
    if (qtyIn <= 0) return 0;
    const runs = this.runsByProduct.get(productId) ?? [];
    let sumH = 0;
    for (const run of runs) sumH += await this.runOverheadTotalCached(run);
    return sumH / qtyIn;
  }

  async productFullUnitCostCached(productId: string) {
    const hit = this.productFulls.get(productId);
    if (hit !== undefined) return hit;
    await this.ensureRuns();
    const qtyIn = await this.productQtyInCached(productId);
    const recipe = await this.recipeUnitCostCached(productId);
    if (qtyIn <= 0) {
      this.productFulls.set(productId, recipe);
      return recipe;
    }
    const runs = this.runsByProduct.get(productId) ?? [];
    let sumI = 0;
    for (const run of runs) {
      sumI +=
        (await this.runIngredientTotalCached(run)) +
        (await this.runOverheadTotalCached(run));
    }
    const v = sumI / qtyIn;
    this.productFulls.set(productId, v);
    return v;
  }

  private async ensureProductStockMaps() {
    if (this.stockMapsReady) return;
    const [soldRows, writtenRows] = await Promise.all([
      qAll(
        db
          .select({
            itemId: sales.itemId,
            qty: sql<number>`coalesce(sum(${sales.qty}), 0)`,
          })
          .from(sales)
          .where(
            and(
              orgEq(sales.organizationId, this.orgId),
              eq(sales.source, "manufactured"),
            ),
          )
          .groupBy(sales.itemId),
      ),
      qAll(
        db
          .select({
            itemId: writeOffs.itemId,
            qty: sql<number>`coalesce(sum(${writeOffs.qty}), 0)`,
          })
          .from(writeOffs)
          .where(
            and(
              orgEq(writeOffs.organizationId, this.orgId),
              eq(writeOffs.kind, "Product"),
            ),
          )
          .groupBy(writeOffs.itemId),
      ),
    ]);
    for (const row of soldRows) {
      this.soldManufactured.set(row.itemId, Number(row.qty));
    }
    for (const row of writtenRows) {
      this.writtenProducts.set(row.itemId, Number(row.qty));
    }
    this.stockMapsReady = true;
  }

  async productStockCached(productId: string) {
    await this.ensureProductStockMaps();
    const made = await this.productQtyInCached(productId);
    return (
      made -
      (this.soldManufactured.get(productId) ?? 0) -
      (this.writtenProducts.get(productId) ?? 0)
    );
  }

  /** Warm cost caches used by products / production list endpoints. */
  async warmListCosts() {
    await this.ensureRuns();
    await this.ensureRecipeLines();
    await this.ensureOverheadRows();
    for (const date of this.runsByDate.keys()) {
      await this.dayGTotal(date);
      await this.dailyPoolCached(date);
    }
  }

  async writeOffUnitCost(kind: string, itemId: string) {
    if (kind === "Ingredient") return await this.avgIngredientCostCached(itemId);
    const full = await this.productFullUnitCostCached(itemId);
    return full > 0 ? full : await this.avgResaleCostCached(itemId);
  }

  async saleUnitCost(source: string, itemId: string) {
    return source === "resale"
      ? await this.avgResaleCostCached(itemId)
      : await this.productFullUnitCostCached(itemId);
  }

  hasProductionOn(date: string) {
    return (this.runsByDate.get(date)?.length ?? 0) > 0;
  }

  private async ensurePurchaseAvgs() {
    if (this.purchaseAvgsReady) return;
    const ingRows = await qAll(
      db
        .select({
          itemId: purchases.itemId,
          total: sql<number>`coalesce(sum(${purchases.total}), 0)`,
          qty: sql<number>`coalesce(sum(${purchases.qty}), 0)`,
        })
        .from(purchases)
        .where(
          and(
            orgEq(purchases.organizationId, this.orgId),
            eq(purchases.kind, "Ingredient"),
          ),
        )
        .groupBy(purchases.itemId),
    );
    for (const row of ingRows) {
      if (row.qty) this.ingredientAvgs.set(row.itemId, row.total / row.qty);
    }
    const resaleRows = await qAll(
      db
        .select({
          itemId: purchases.itemId,
          total: sql<number>`coalesce(sum(${purchases.total}), 0)`,
          qty: sql<number>`coalesce(sum(${purchases.qty}), 0)`,
        })
        .from(purchases)
        .where(
          and(
            orgEq(purchases.organizationId, this.orgId),
            eq(purchases.kind, "Product"),
          ),
        )
        .groupBy(purchases.itemId),
    );
    for (const row of resaleRows) {
      if (row.qty) this.resaleAvgs.set(row.itemId, row.total / row.qty);
    }
    this.purchaseAvgsReady = true;
  }

  private async ensureRecipeLines() {
    if (this.recipeLinesReady) return;
    await this.ensurePurchaseAvgs();
    const lines = await qAll(
      db
        .select({
          productId: recipeLines.productId,
          ingredientId: recipeLines.ingredientId,
          qty: recipeLines.qty,
        })
        .from(recipeLines)
        .where(orgEq(recipeLines.organizationId, this.orgId)),
    );
    for (const line of lines) {
      const bucket = this.recipeByProduct.get(line.productId) ?? [];
      bucket.push({ ingredientId: line.ingredientId, qty: line.qty });
      this.recipeByProduct.set(line.productId, bucket);
    }
    this.recipeLinesReady = true;
  }

  /** Precompute pools, day totals, and product costs (one pass for all P&L cards). */
  async warm() {
    await this.ensureRuns();
    await this.ensureOverheadRows();
    await this.ensureRecipeLines();
    for (const date of this.runsByDate.keys()) {
      await this.dayGTotal(date);
      await this.dailyPoolCached(date);
    }
    for (const productId of this.runsByProduct.keys()) {
      await this.productFullUnitCostCached(productId);
    }
  }
}

export async function productionIngredientCost(
  orgId: string,
  productId: string,
  qty: number,
): Promise<number> {
  return (await recipeUnitCost(orgId, productId)) * qty;
}
export async function allocateOverheadForRun(
  orgId: string,
  date: string,
  productId: string,
  qty: number,
): Promise<number> {
  return await runOverheadTotal(orgId, date, productId, qty);
}
/** Excel product col E: if qtyIn=0 → recipe; else SUM(run G)/qtyIn */
export async function productIngredientUnitCost(
  orgId: string,
  productId: string,
): Promise<number> {
  const qtyIn = await productQtyIn(orgId, productId);
  const recipe = await recipeUnitCost(orgId, productId);
  if (qtyIn <= 0) return recipe;
  const runs = await qAll(
    db
      .select()
      .from(productionRuns)
      .where(
        and(
          orgEq(productionRuns.organizationId, orgId),
          eq(productionRuns.productId, productId),
        ),
      ),
  );
  let sumG = 0;
  for (const run of runs) sumG += await runIngredientTotal(orgId, run);
  return sumG / qtyIn;
}
/** Excel product col F: SUM(run H)/qtyIn */
export async function productOverheadUnitCost(
  orgId: string,
  productId: string,
): Promise<number> {
  const qtyIn = await productQtyIn(orgId, productId);
  if (qtyIn <= 0) return 0;
  const runs = await qAll(
    db
      .select()
      .from(productionRuns)
      .where(
        and(
          orgEq(productionRuns.organizationId, orgId),
          eq(productionRuns.productId, productId),
        ),
      ),
  );
  let sumH = 0;
  for (const run of runs) {
    sumH += await runOverheadTotal(
      orgId,
      run.date,
      run.productId,
      run.qty,
      run.id,
    );
  }
  return sumH / qtyIn;
}
/** Excel product col H: if qtyIn=0 → recipe; else SUM(run I)/qtyIn where I=G+H */
export async function productFullUnitCost(
  orgId: string,
  productId: string,
): Promise<number> {
  const qtyIn = await productQtyIn(orgId, productId);
  const recipe = await recipeUnitCost(orgId, productId);
  if (qtyIn <= 0) return recipe;
  const runs = await qAll(
    db
      .select()
      .from(productionRuns)
      .where(
        and(
          orgEq(productionRuns.organizationId, orgId),
          eq(productionRuns.productId, productId),
        ),
      ),
  );
  let sumI = 0;
  for (const run of runs) {
    const g = await runIngredientTotal(orgId, run);
    const h = await runOverheadTotal(
      orgId,
      run.date,
      run.productId,
      run.qty,
      run.id,
    );
    sumI += g + h;
  }
  return sumI / qtyIn;
}
export async function plSummary(
  orgId: string,
  from: string,
  to: string,
  cache?: PlComputeCache,
) {
  const c = cache ?? new PlComputeCache(orgId);
  const revenue =
    (
      await qGet(
        db
          .select({ a: sql<number>`coalesce(sum(${sales.revenue}), 0)` })
          .from(sales)
          .where(
            and(
              orgEq(sales.organizationId, orgId),
              gte(sales.date, from),
              lt(sales.date, to),
            ),
          ),
      )
    )?.a ?? 0;
  const saleRows = await qAll(
    db
      .select()
      .from(sales)
      .where(
        and(
          orgEq(sales.organizationId, orgId),
          gte(sales.date, from),
          lt(sales.date, to),
        ),
      ),
  );
  let cogs = 0;
  for (const s of saleRows) {
    cogs += (await c.saleUnitCost(s.source, s.itemId)) * s.qty;
  }
  const woRows = await qAll(
    db
      .select()
      .from(writeOffs)
      .where(
        and(
          orgEq(writeOffs.organizationId, orgId),
          gte(writeOffs.date, from),
          lt(writeOffs.date, to),
        ),
      ),
  );
  let writeOffCost = 0;
  for (const w of woRows) {
    writeOffCost += (await c.writeOffUnitCost(w.kind, w.itemId)) * w.qty;
  }
  let ohTotal = 0;
  let allocated = 0;
  let unallocated = 0;
  for (const date of enumerateDates(from, to)) {
    const pool = await c.dailyPoolCached(date);
    ohTotal += pool;
    if (c.hasProductionOn(date)) allocated += pool;
    else unallocated += pool;
  }
  const gross = revenue - cogs;
  const net = gross - writeOffCost - unallocated;
  return {
    revenue,
    cogs,
    gross,
    writeOffCost,
    ohTotal,
    allocated,
    unallocated,
    net,
  };
}

/** All dashboard P&L cards — one cache, sequential ranges (fast on Neon). */
export async function plAllSummaries(orgId: string) {
  const ranges = plPeriodRanges();
  const cache = new PlComputeCache(orgId);
  await cache.warm();
  const day = await plSummary(orgId, ranges.day.from, ranges.day.to, cache);
  const week = await plSummary(orgId, ranges.week.from, ranges.week.to, cache);
  const month = await plSummary(orgId, ranges.month.from, ranges.month.to, cache);
  const lastMonth = await plSummary(
    orgId,
    ranges.lastMonth.from,
    ranges.lastMonth.to,
    cache,
  );
  return { day, week, month, lastMonth };
}

export type PlBlock = Awaited<ReturnType<typeof plSummary>>;

export function plPeriodRanges(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const dayStart = localDateYmd(now);
  const dayEnd = localDateYmd(new Date(y, m, d + 1));
  const weekStartDate = new Date(y, m, d - ((now.getDay() + 6) % 7));
  const weekStart = localDateYmd(weekStartDate);
  const weekEnd = localDateYmd(
    new Date(
      weekStartDate.getFullYear(),
      weekStartDate.getMonth(),
      weekStartDate.getDate() + 7,
    ),
  );
  const monthStart = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const monthEnd = localDateYmd(new Date(y, m + 1, 1));
  const lastMonthStart = localDateYmd(new Date(y, m - 1, 1));
  const lastMonthEnd = monthStart;
  return {
    day: { from: dayStart, to: dayEnd },
    week: { from: weekStart, to: weekEnd },
    month: { from: monthStart, to: monthEnd },
    lastMonth: { from: lastMonthStart, to: lastMonthEnd },
  };
}

function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  let cur = from;
  while (cur < to) {
    dates.push(cur);
    const [y, m, d] = cur.split("-").map(Number);
    cur = localDateYmd(new Date(y, m - 1, d + 1));
  }
  return dates;
}

async function plNameMaps(orgId: string) {
  const [prods, resale] = await Promise.all([
    qAll(
      db
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(orgEq(products.organizationId, orgId)),
    ),
    qAll(
      db
        .select({ id: resaleProducts.id, name: resaleProducts.name })
        .from(resaleProducts)
        .where(orgEq(resaleProducts.organizationId, orgId)),
    ),
  ]);
  return {
    productNames: new Map(prods.map((p) => [p.id, p.name])),
    resaleNames: new Map(resale.map((r) => [r.id, r.name])),
  };
}

/** Full P&L drill-down for a date range [from, to) — daily rows, not per-sale lines. */
export async function plDetails(orgId: string, from: string, to: string) {
  const cache = new PlComputeCache(orgId);
  await cache.warm();
  const summary = await plSummary(orgId, from, to, cache);
  const maps = await plNameMaps(orgId);

  const saleRows = await qAll(
    db
      .select()
      .from(sales)
      .where(
        and(
          orgEq(sales.organizationId, orgId),
          gte(sales.date, from),
          lt(sales.date, to),
        ),
      ),
  );

  const woRows = await qAll(
    db
      .select()
      .from(writeOffs)
      .where(
        and(
          orgEq(writeOffs.organizationId, orgId),
          gte(writeOffs.date, from),
          lt(writeOffs.date, to),
        ),
      ),
  );

  const dayMap = new Map<
    string,
    { revenue: number; cogs: number; writeOffCost: number }
  >();
  const salesByDate = new Map<
    string,
    Array<{
      id: number;
      itemName: string;
      source: string;
      qty: number;
      unitPrice: number;
      unitCost: number;
      revenue: number;
      cogs: number;
    }>
  >();

  const touch = (date: string) => {
    let row = dayMap.get(date);
    if (!row) {
      row = { revenue: 0, cogs: 0, writeOffCost: 0 };
      dayMap.set(date, row);
    }
    return row;
  };

  for (const row of saleRows) {
    const unitCost = await cache.saleUnitCost(row.source, row.itemId);
    const acc = touch(row.date);
    acc.revenue += row.revenue;
    acc.cogs += unitCost * row.qty;
    const itemName =
      row.source === "resale"
        ? (maps.resaleNames.get(row.itemId) ?? row.itemId)
        : (maps.productNames.get(row.itemId) ?? row.itemId);
    const daySales = salesByDate.get(row.date) ?? [];
    daySales.push({
      id: row.id,
      itemName,
      source: row.source,
      qty: row.qty,
      unitPrice: row.unitPrice,
      unitCost,
      revenue: row.revenue,
      cogs: unitCost * row.qty,
    });
    salesByDate.set(row.date, daySales);
  }

  for (const w of woRows) {
    const acc = touch(w.date);
    acc.writeOffCost += (await cache.writeOffUnitCost(w.kind, w.itemId)) * w.qty;
  }

  const daily = [];
  for (const date of enumerateDates(from, to)) {
    const acc = dayMap.get(date) ?? {
      revenue: 0,
      cogs: 0,
      writeOffCost: 0,
    };
    const overhead = await cache.dailyPoolCached(date);
    const hasProduction = cache.hasProductionOn(date);
    const allocated = hasProduction ? overhead : 0;
    const unallocated = hasProduction ? 0 : overhead;
    const gross = acc.revenue - acc.cogs;
    const net = gross - acc.writeOffCost - unallocated;
    daily.push({
      date,
      revenue: acc.revenue,
      cogs: acc.cogs,
      gross,
      writeOffCost: acc.writeOffCost,
      overhead,
      allocated,
      unallocated,
      net,
      hasProduction,
      sales: salesByDate.get(date) ?? [],
    });
  }

  return {
    from,
    to,
    summary,
    daily,
  };
}
export function newId(): string {
  return crypto.randomUUID();
}

/** Escape a string for safe use inside RegExp. */
function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Excel-style short prefix for a category.
 * e.g. "რძის ნაწარმი" → "რ" (from existing რ-01…), "ხილ-ბოსტანი" → "ბ".
 * New categories: shortest unique prefix (1→3 chars, then digit suffix)
 * so "newone" and "newww" do not both claim "n".
 */
export function categoryIdPrefix(
  category: string,
  existing: Array<{ id: string; category: string }>,
): string {
  const cat = category.trim();
  if (!cat) return "";

  const counts = new Map<string, number>();
  for (const row of existing) {
    if (row.category.trim() !== cat) continue;
    const m = row.id.match(/^(.+)-(\d+)$/);
    if (!m) continue;
    const prefix = m[1];
    // Excel codes are short (რ, ბ, ხ, მ); skip mistaken full-name IDs
    if ([...prefix].length > 3) continue;
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }
  if (counts.size > 0) {
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  }

  const claimed = new Set<string>();
  for (const row of existing) {
    if (row.category.trim() === cat) continue;
    const m = row.id.match(/^(.+)-(\d+)$/);
    if (!m) continue;
    const prefix = m[1];
    if ([...prefix].length > 3) continue;
    claimed.add(prefix);
  }

  const chars = [...cat];
  for (let len = 1; len <= Math.min(3, chars.length); len++) {
    const candidate = chars.slice(0, len).join("");
    if (!claimed.has(candidate)) return candidate;
  }

  const base =
    chars.slice(0, Math.min(2, chars.length)).join("") || chars[0] || "x";
  for (let n = 2; n <= 9; n++) {
    const candidate = `${base}${n}`;
    if (!claimed.has(candidate)) return candidate;
  }
  return `${base}${Date.now().toString(36).slice(-2)}`;
}

/**
 * Next Excel-style code for a category prefix: `რ-21` if `რ-20` is the highest.
 * Does not reuse gaps (deleted `რ-17` stays unused). Empty prefix → UUID.
 */
export function nextCategoryCode(prefix: string, existingIds: string[]): string {
  const p = prefix.trim();
  if (!p) return newId();
  const re = new RegExp(`^${escapeRegExp(p)}-(\\d+)$`);
  let max = 0;
  let pad = 2;
  for (const id of existingIds) {
    const m = id.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (!Number.isFinite(n)) continue;
    if (n > max) max = n;
    pad = Math.max(pad, m[1].length);
  }
  return `${p}-${String(max + 1).padStart(pad, "0")}`;
}

export { desc, eq, and, orgEq };
