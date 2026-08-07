import { useCallback, useEffect, useState } from "react";
import { ConfirmModal } from "../components/ConfirmModal";
import { DateField } from "../components/DateField";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { ModalForm } from "../components/ModalForm";
import { SelectField } from "../components/SelectField";
import { Button, PageHeader, Surface } from "../components/ui";
import { unitLabel } from "../i18n";
import { api, formatApiError, money, qty, today } from "../lib/api";
import { usePrefs } from "../preferences/PreferencesContext";
import { usePageCount } from "../preferences/CountsContext";

type Sale = {
  id: number;
  date: string;
  source: string;
  itemId: string;
  qty: number;
  unitPrice: number;
  revenue: number;
};
type Opt = { id: string; name: string; unit?: string };
type SaleSource = "manufactured" | "resale";

function useItemStock(
  source: SaleSource,
  itemId: string,
  creditQty = 0,
  enabled = true,
) {
  const [stock, setStock] = useState<number | null>(null);
  const [unitCost, setUnitCost] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !itemId) {
      setStock(null);
      setUnitCost(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api<{ stock: number; unitCost: number }>(
      `/item-stock?source=${encodeURIComponent(source)}&itemId=${encodeURIComponent(itemId)}`,
    )
      .then((r) => {
        if (!cancelled) {
          setStock(r.stock + creditQty);
          setUnitCost(r.unitCost);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStock(null);
          setUnitCost(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [source, itemId, creditQty, enabled]);

  return { stock, unitCost, loading };
}

export function SalesPage() {
  const { t, numberLocale, locale } = usePrefs();
  const [rows, setRows] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Opt[]>([]);
  const [resale, setResale] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(today());
  const [source, setSource] = useState<SaleSource>("manufactured");
  const [itemId, setItemId] = useState("");
  const [q, setQ] = useState("1");
  const [price, setPrice] = useState("0");

  const [editing, setEditing] = useState<Sale | null>(null);
  const [editDate, setEditDate] = useState(today());
  const [editSource, setEditSource] = useState<SaleSource>("manufactured");
  const [editItemId, setEditItemId] = useState("");
  const [editQty, setEditQty] = useState("1");
  const [editPrice, setEditPrice] = useState("0");
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Sale | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");

  const load = useCallback(async () => {
    try {
      const sP = api<Sale[]>("/sales").then((s) => {
        setRows(s);
        setLoading(false);
      });
      const pP = api<Opt[]>("/products?minimal=1").then(setProducts);
      const rP = api<Opt[]>("/resale?minimal=1").then(setResale);
      await Promise.all([sP, pP, rP]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const list = source === "manufactured" ? products : resale;
    if (list[0]) setItemId(list[0].id);
  }, [source, products, resale]);

  useEffect(() => {
    if (!editing) return;
    const list = editSource === "manufactured" ? products : resale;
    if (!list.some((o) => o.id === editItemId) && list[0]) {
      setEditItemId(list[0].id);
    }
  }, [editing, editSource, products, resale, editItemId]);

  const options = source === "manufactured" ? products : resale;
  const editOptions = editSource === "manufactured" ? products : resale;
  const selected = options.find((o) => o.id === itemId);
  const editSelected = editOptions.find((o) => o.id === editItemId);
  const names = Object.fromEntries(
    [...products, ...resale].map((o) => [o.id, o.name]),
  );

  const createStock = useItemStock(source, itemId);
  const editCredit =
    editing &&
    editing.source === editSource &&
    editing.itemId === editItemId
      ? editing.qty
      : 0;
  const editStock = useItemStock(
    editSource,
    editItemId,
    editCredit,
    Boolean(editing),
  );

  const pageCount = usePageCount("sales", loading ? null : rows.length);

  function stockHint(
    available: number | null,
    unitCost: number | null,
    loadingStock: boolean,
    unit?: string,
  ) {
    const qtyText = loadingStock
      ? "…"
      : available == null
        ? "—"
        : `${qty(available, numberLocale)}${
            unit ? ` ${unitLabel(locale, unit)}` : ""
          }`;
    const costText = loadingStock
      ? "…"
      : unitCost == null
        ? "—"
        : money(unitCost, numberLocale);
    return (
      <p className="text-xs font-normal text-ink-muted">
        {t("sales.inStock", { qty: qtyText })}
        <span className="mx-1.5 text-line-strong">·</span>
        {t("sales.unitCost", { cost: costText })}
      </p>
    );
  }

  function openEdit(row: Sale) {
    setEditing(row);
    setEditDate(row.date);
    setEditSource(row.source === "resale" ? "resale" : "manufactured");
    setEditItemId(row.itemId);
    setEditQty(String(row.qty));
    setEditPrice(String(row.unitPrice));
    setEditErr("");
    setDeleteErr("");
    setPendingDelete(null);
  }

  function closeEdit() {
    if (editBusy || deleting) return;
    setEditing(null);
    setEditErr("");
    setPendingDelete(null);
    setDeleteErr("");
  }

  async function saveEdit() {
    if (!editing || editBusy || deleting) return;
    const qtyNum = Number(editQty);
    const priceNum = Number(editPrice);
    if (
      !Number.isFinite(qtyNum) ||
      qtyNum <= 0 ||
      !Number.isFinite(priceNum) ||
      priceNum < 0
    ) {
      setEditErr(t("common.formInvalid"));
      return;
    }
    setEditBusy(true);
    setEditErr("");
    try {
      await api(`/sales/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          date: editDate,
          source: editSource,
          itemId: editItemId,
          qty: qtyNum,
          unitPrice: priceNum,
        }),
      });
      setEditing(null);
      await load();
    } catch (e) {
      setEditErr(formatApiError(e, t));
    } finally {
      setEditBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteErr("");
    try {
      await api(`/sales/${pendingDelete.id}`, { method: "DELETE" });
      setPendingDelete(null);
      setEditing(null);
      await load();
    } catch (e) {
      setDeleteErr(formatApiError(e, t));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader
        title={t("sales.title")}
        description={t("sales.description")}
        count={pageCount}
        actions={
          <ModalForm
            title={t("sales.newTitle")}
            triggerLabel={t("common.add")}
            onSubmit={async () => {
              await api("/sales", {
                method: "POST",
                body: JSON.stringify({
                  date,
                  source,
                  itemId,
                  qty: Number(q),
                  unitPrice: Number(price),
                }),
              });
              load();
            }}
          >
            <div className="field">
              <span>{t("common.date")}</span>
              <DateField value={date} onChange={setDate} />
            </div>
            <div className="field">
              <span>{t("common.source")}</span>
              <SelectField
                value={source}
                onChange={(v) => setSource(v as SaleSource)}
                searchable={false}
                options={[
                  { value: "manufactured", label: t("sales.manufactured") },
                  { value: "resale", label: t("sales.resale") },
                ]}
              />
            </div>
            <div className="field">
              <span>{t("common.product")}</span>
              <SelectField
                value={itemId}
                onChange={setItemId}
                required
                options={options.map((o) => ({ value: o.id, label: o.name }))}
              />
              {stockHint(
                createStock.stock,
                createStock.unitCost,
                createStock.loading,
                selected?.unit,
              )}
            </div>
            <label className="field">
              {t("common.qty")}
              <input
                type="number"
                step="any"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <label className="field">
              {t("sales.sellPrice")}
              <input
                type="number"
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
          </ModalForm>
        }
      />
      <Surface>
        <DataTable
          rows={rows}
          loading={loading}
          rowKey={(r) => r.id}
          defaultSortKey="date"
          defaultSortDir="desc"
          columns={[
            {
              key: "date",
              label: t("common.date"),
              sortValue: (r) => r.date,
              filterValue: (r) => r.date,
              render: (r) => r.date,
            },
            {
              key: "source",
              label: t("common.source"),
              sortValue: (r) => r.source,
              filterValue: (r) =>
                r.source === "manufactured"
                  ? t("sales.manufactured")
                  : t("sales.resale"),
              render: (r) =>
                r.source === "manufactured"
                  ? t("sales.manufactured")
                  : t("sales.resale"),
            },
            {
              key: "itemId",
              label: t("common.name"),
              sortValue: (r) => names[r.itemId] ?? r.itemId,
              filterValue: (r) => `${r.itemId} ${names[r.itemId] ?? ""}`,
              render: (r) => names[r.itemId] ?? r.itemId,
            },
            {
              key: "qty",
              label: t("common.qtyShort"),
              title: t("common.qty"),
              align: "right",
              sortValue: (r) => r.qty,
              filterValue: (r) => String(r.qty),
              render: (r) => qty(r.qty, numberLocale),
            },
            {
              key: "unitPrice",
              label: t("common.price"),
              align: "right",
              sortValue: (r) => r.unitPrice,
              filterValue: (r) => String(r.unitPrice),
              render: (r) => money(r.unitPrice, numberLocale),
            },
            {
              key: "revenue",
              label: t("sales.revenue"),
              align: "right",
              sortValue: (r) => r.revenue,
              filterValue: (r) => String(r.revenue),
              render: (r) => money(r.revenue, numberLocale),
            },
            {
              key: "actions",
              label: "",
              sortable: false,
              filterable: false,
              render: (r) => (
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-w-22"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEdit(r);
                  }}
                >
                  {t("common.edit")}
                </Button>
              ),
            },
          ]}
        />
      </Surface>

      <Modal
        title={t("sales.editTitle")}
        open={Boolean(editing)}
        onClose={closeEdit}
        listenKeys={!pendingDelete}
      >
        <form
          noValidate
          className="space-y-1"
          onSubmit={(e) => {
            e.preventDefault();
            void saveEdit();
          }}
        >
          <div className="field">
            <span>{t("common.date")}</span>
            <DateField value={editDate} onChange={setEditDate} required />
          </div>
          <div className="field">
            <span>{t("common.source")}</span>
            <SelectField
              value={editSource}
              onChange={(v) => {
                const next = v as SaleSource;
                if (next === editSource) return;
                setEditSource(next);
                setEditQty("");
                setEditPrice("");
                setEditErr("");
              }}
              searchable={false}
              options={[
                { value: "manufactured", label: t("sales.manufactured") },
                { value: "resale", label: t("sales.resale") },
              ]}
            />
          </div>
          <div className="field">
            <span>{t("common.product")}</span>
            <SelectField
              value={editItemId}
              onChange={(v) => {
                if (v === editItemId) return;
                setEditItemId(v);
                setEditQty("");
                setEditPrice("");
                setEditErr("");
              }}
              required
              options={editOptions.map((o) => ({
                value: o.id,
                label: o.name,
              }))}
            />
            {stockHint(
              editStock.stock,
              editStock.unitCost,
              editStock.loading,
              editSelected?.unit,
            )}
          </div>
          <label className="field">
            {t("common.qty")}
            <input
              type="number"
              step="any"
              value={editQty}
              onChange={(e) => setEditQty(e.target.value)}
              required
            />
          </label>
          <label className="field">
            {t("sales.sellPrice")}
            <input
              type="number"
              step="any"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
              required
            />
          </label>
          {editErr ? (
            <div
              role="alert"
              className="mt-3 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-sm text-danger"
            >
              {editErr}
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="danger"
              disabled={editBusy || deleting}
              onClick={() => {
                if (!editing) return;
                setDeleteErr("");
                setPendingDelete(editing);
              }}
            >
              {t("common.delete")}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={closeEdit}
                disabled={editBusy || deleting}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={editBusy || deleting}>
                {editBusy ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(pendingDelete)}
        stacked
        title={t("sales.deleteTitle")}
        message={
          <div className="space-y-3">
            <p>{t("sales.deleteConfirm")}</p>
            <p className="rounded-xl border border-amber/35 bg-amber/10 px-3.5 py-3 text-sm text-ink-soft">
              {t("sales.deleteWarn")}
            </p>
          </div>
        }
        error={deleteErr}
        busy={deleting}
        onCancel={() => {
          if (deleting) return;
          setPendingDelete(null);
          setDeleteErr("");
        }}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
