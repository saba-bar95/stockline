import { useCallback, useEffect, useMemo, useState } from "react";
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

type Purchase = {
  id: number;
  date: string;
  kind: string;
  itemId: string;
  qty: number;
  unitPrice: number;
  total: number;
};
type Opt = { id: string; name: string; unit: string };
type Kind = "Ingredient" | "Product";

function PriceInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step="any"
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "") {
          onChange("");
          return;
        }
        if (Number(v) < 0) return;
        onChange(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "-" || e.key === "+" || e.key === "e" || e.key === "E") {
          e.preventDefault();
        }
      }}
    />
  );
}

export function PurchasesPage() {
  const { t, locale, numberLocale } = usePrefs();
  const [rows, setRows] = useState<Purchase[]>([]);
  const [ings, setIngs] = useState<Opt[]>([]);
  const [resale, setResale] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(today());
  const [kind, setKind] = useState<Kind>("Ingredient");
  const [itemId, setItemId] = useState("");
  const [q, setQ] = useState("1");
  const [price, setPrice] = useState("");

  const [editing, setEditing] = useState<Purchase | null>(null);
  const [editDate, setEditDate] = useState(today());
  const [editKind, setEditKind] = useState<Kind>("Ingredient");
  const [editItemId, setEditItemId] = useState("");
  const [editQty, setEditQty] = useState("1");
  const [editPrice, setEditPrice] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState("");

  const [pendingDelete, setPendingDelete] = useState<Purchase | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");

  const load = useCallback(async () => {
    try {
      const pP = api<Purchase[]>("/purchases").then((p) => {
        setRows(p);
        setLoading(false);
      });
      const iP = api<Opt[]>("/ingredients?minimal=1").then(setIngs);
      const rP = api<Opt[]>("/resale?minimal=1").then(setResale);
      await Promise.all([pP, iP, rP]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const list = kind === "Ingredient" ? ings : resale;
    if (list[0]) setItemId(list[0].id);
  }, [kind, ings, resale]);

  useEffect(() => {
    if (!editing) return;
    const list = editKind === "Ingredient" ? ings : resale;
    if (!list.some((o) => o.id === editItemId) && list[0]) {
      setEditItemId(list[0].id);
    }
  }, [editKind, ings, resale, editItemId, editing]);

  const options = kind === "Ingredient" ? ings : resale;
  const selected = useMemo(
    () => options.find((o) => o.id === itemId),
    [options, itemId],
  );
  const editOptions = editKind === "Ingredient" ? ings : resale;
  const editSelected = useMemo(
    () => editOptions.find((o) => o.id === editItemId),
    [editOptions, editItemId],
  );
  const names = Object.fromEntries(
    [...ings, ...resale].map((o) => [o.id, o.name]),
  );

  function formatPurchaseError(e: unknown): string {
    return formatApiError(e, t);
  }

  function openEdit(row: Purchase) {
    setEditing(row);
    setEditDate(row.date);
    setEditKind(row.kind === "Product" ? "Product" : "Ingredient");
    setEditItemId(row.itemId);
    setEditQty(String(row.qty));
    setEditPrice(String(row.unitPrice));
    setEditErr("");
    setDeleteErr("");
  }

  function closeEdit() {
    if (editBusy || deleting) return;
    setEditing(null);
    setPendingDelete(null);
    setEditErr("");
    setDeleteErr("");
  }

  async function saveEdit() {
    if (!editing || editBusy) return;
    const unitPrice = Number(editPrice);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      setEditErr(t("purchases.priceRequired"));
      return;
    }
    const qtyNum = Number(editQty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setEditErr(t("common.formInvalid"));
      return;
    }
    setEditBusy(true);
    setEditErr("");
    try {
      await api(`/purchases/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          date: editDate,
          kind: editKind,
          itemId: editItemId,
          qty: qtyNum,
          unitPrice,
        }),
      });
      setEditing(null);
      await load();
    } catch (e) {
      setEditErr(formatPurchaseError(e));
    } finally {
      setEditBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteErr("");
    try {
      await api(`/purchases/${pendingDelete.id}`, { method: "DELETE" });
      setPendingDelete(null);
      setEditing(null);
      await load();
    } catch (e) {
      setDeleteErr(formatPurchaseError(e));
    } finally {
      setDeleting(false);
    }
  }

  const deleteName =
    names[pendingDelete?.itemId ?? ""] ?? pendingDelete?.itemId ?? "";

  const pageCount = usePageCount("purchases", loading ? null : rows.length);

  return (
    <>
      <PageHeader
        title={t("purchases.title")}
        description={t("purchases.description")}
        count={pageCount}
        actions={
          <ModalForm
            title={t("purchases.newTitle")}
            triggerLabel={t("common.add")}
            onSubmit={async () => {
              if (!date) throw new Error(t("common.dateRequired"));
              const qtyNum = Number(q);
              if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
                throw new Error(t("common.qtyRequired"));
              }
              const unitPrice = Number(price);
              if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
                throw new Error(t("purchases.priceRequired"));
              }
              await api("/purchases", {
                method: "POST",
                body: JSON.stringify({
                  date,
                  kind,
                  itemId,
                  qty: qtyNum,
                  unitPrice,
                }),
              });
              setPrice("");
              load();
            }}
          >
            <div className="field">
              <span>{t("common.date")}</span>
              <DateField value={date} onChange={setDate} required />
            </div>
            <div className="field">
              <span>{t("common.type")}</span>
              <SelectField
                value={kind}
                onChange={(v) => setKind(v as Kind)}
                searchable={false}
                options={[
                  { value: "Ingredient", label: t("purchases.kindIngredient") },
                  { value: "Product", label: t("purchases.kindProduct") },
                ]}
              />
            </div>
            <div className="field">
              <span>{t("common.name")}</span>
              <SelectField
                value={itemId}
                onChange={setItemId}
                required
                options={options.map((o) => ({ value: o.id, label: o.name }))}
              />
              {selected?.unit ? (
                <p className="text-xs font-normal text-ink-muted">
                  {t("common.unit")}:{" "}
                  <span className="font-medium text-ink-soft">
                    {unitLabel(locale, selected.unit)}
                  </span>
                </p>
              ) : null}
            </div>
            <div className="field">
              <span>{t("common.qty")}</span>
              <input
                type="number"
                step="any"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="field">
              <span>{t("common.pricePerUnit")}</span>
              <PriceInput value={price} onChange={setPrice} />
            </div>
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
              key: "kind",
              label: t("common.type"),
              sortValue: (r) => r.kind,
              filterValue: (r) =>
                r.kind === "Ingredient"
                  ? t("purchases.kindIngredient")
                  : t("purchases.kindProductShort"),
              render: (r) =>
                r.kind === "Ingredient"
                  ? t("purchases.kindIngredient")
                  : t("purchases.kindProductShort"),
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
              key: "total",
              label: t("common.total"),
              align: "right",
              sortValue: (r) => r.total,
              filterValue: (r) => String(r.total),
              render: (r) => money(r.total, numberLocale),
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
        title={t("purchases.editTitle")}
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
            <span>{t("common.type")}</span>
            <SelectField
              value={editKind}
              onChange={(v) => setEditKind(v as Kind)}
              searchable={false}
              options={[
                { value: "Ingredient", label: t("purchases.kindIngredient") },
                { value: "Product", label: t("purchases.kindProduct") },
              ]}
            />
          </div>
          <div className="field">
            <span>{t("common.name")}</span>
            <SelectField
              value={editItemId}
              onChange={setEditItemId}
              required
              options={editOptions.map((o) => ({
                value: o.id,
                label: o.name,
              }))}
            />
            {editSelected?.unit ? (
              <p className="text-xs font-normal text-ink-muted">
                {t("common.unit")}:{" "}
                <span className="font-medium text-ink-soft">
                  {unitLabel(locale, editSelected.unit)}
                </span>
              </p>
            ) : null}
          </div>
          <div className="field">
            <span>{t("common.qty")}</span>
            <input
              type="number"
              step="any"
              value={editQty}
              onChange={(e) => setEditQty(e.target.value)}
            />
          </div>
          <div className="field">
            <span>{t("common.pricePerUnit")}</span>
            <PriceInput value={editPrice} onChange={setEditPrice} />
          </div>

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
                disabled={editBusy}
                onClick={closeEdit}
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
        title={t("purchases.deleteTitle")}
        message={
          <div className="space-y-3">
            <p>
              {t("purchases.deleteConfirm", {
                name: deleteName,
              })}
            </p>
            <div className="rounded-xl border border-amber/35 bg-amber/10 px-3.5 py-3 text-ink-soft">
              <p className="font-medium text-ink">{t("purchases.deleteWarnIntro")}</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm">
                <li>{t("purchases.deleteWarnStock")}</li>
                <li>{t("purchases.deleteWarnAvg")}</li>
                <li>{t("purchases.deleteWarnCosts")}</li>
                <li>{t("purchases.deleteWarnPl")}</li>
                <li>{t("purchases.deleteWarnSnap")}</li>
              </ul>
            </div>
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
