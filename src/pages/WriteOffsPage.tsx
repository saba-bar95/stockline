import { useCallback, useEffect, useState } from "react";
import { ConfirmModal } from "../components/ConfirmModal";
import { DateField } from "../components/DateField";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { ModalForm } from "../components/ModalForm";
import { SelectField } from "../components/SelectField";
import { Button, PageHeader, Surface } from "../components/ui";
import { unitLabel } from "../i18n";
import { api, formatApiError, qty, today } from "../lib/api";
import { usePrefs } from "../preferences/PreferencesContext";
import { usePageCount } from "../preferences/CountsContext";

type Row = {
  id: number;
  date: string;
  kind: string;
  itemId: string;
  qty: number;
  note: string;
};
type Opt = { id: string; name: string; unit?: string };
type WriteOffKind = "Ingredient" | "Product";
type StockSource = "ingredient" | "manufactured" | "resale";

function stockSourceFor(
  kind: WriteOffKind,
  itemId: string,
  prods: Opt[],
): StockSource {
  if (kind === "Ingredient") return "ingredient";
  return prods.some((p) => p.id === itemId) ? "manufactured" : "resale";
}

function useItemStock(
  source: StockSource,
  itemId: string,
  creditQty = 0,
  enabled = true,
) {
  const [stock, setStock] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !itemId) {
      setStock(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api<{ stock: number }>(
      `/item-stock?source=${encodeURIComponent(source)}&itemId=${encodeURIComponent(itemId)}`,
    )
      .then((r) => {
        if (!cancelled) setStock(r.stock + creditQty);
      })
      .catch(() => {
        if (!cancelled) setStock(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [source, itemId, creditQty, enabled]);

  return { stock, loading };
}

export function WriteOffsPage() {
  const { t, numberLocale, locale } = usePrefs();
  const [rows, setRows] = useState<Row[]>([]);
  const [ings, setIngs] = useState<Opt[]>([]);
  const [prods, setProds] = useState<Opt[]>([]);
  const [resale, setResale] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(today());
  const [kind, setKind] = useState<WriteOffKind>("Ingredient");
  const [itemId, setItemId] = useState("");
  const [q, setQ] = useState("1");
  const [note, setNote] = useState("");

  const [editing, setEditing] = useState<Row | null>(null);
  const [editDate, setEditDate] = useState(today());
  const [editKind, setEditKind] = useState<WriteOffKind>("Ingredient");
  const [editItemId, setEditItemId] = useState("");
  const [editQty, setEditQty] = useState("1");
  const [editNote, setEditNote] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");

  const load = useCallback(async () => {
    try {
      const wP = api<Row[]>("/write-offs").then((w) => {
        setRows(w);
        setLoading(false);
      });
      const iP = api<Opt[]>("/ingredients?minimal=1").then(setIngs);
      const pP = api<Opt[]>("/products?minimal=1").then(setProds);
      const rP = api<Opt[]>("/resale?minimal=1").then(setResale);
      await Promise.all([wP, iP, pP, rP]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const options = kind === "Ingredient" ? ings : [...prods, ...resale];
  const editOptions =
    editKind === "Ingredient" ? ings : [...prods, ...resale];
  const names = Object.fromEntries(
    [...ings, ...prods, ...resale].map((o) => [o.id, o.name]),
  );
  const selected = options.find((o) => o.id === itemId);
  const editSelected = editOptions.find((o) => o.id === editItemId);

  useEffect(() => {
    if (options[0]) setItemId(options[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, ings, prods, resale]);

  useEffect(() => {
    if (!editing) return;
    const list = editKind === "Ingredient" ? ings : [...prods, ...resale];
    if (!list.some((o) => o.id === editItemId) && list[0]) {
      setEditItemId(list[0].id);
    }
  }, [editing, editKind, ings, prods, resale, editItemId]);

  const createStock = useItemStock(
    stockSourceFor(kind, itemId, prods),
    itemId,
  );
  const editCredit =
    editing &&
    editing.kind === editKind &&
    editing.itemId === editItemId
      ? editing.qty
      : 0;
  const editStock = useItemStock(
    stockSourceFor(editKind, editItemId, prods),
    editItemId,
    editCredit,
    Boolean(editing),
  );

  const pageCount = usePageCount("writeOffs", loading ? null : rows.length);

  function stockHint(
    available: number | null,
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
    return (
      <p className="text-xs font-normal text-ink-muted">
        {t("writeOffs.inStock", { qty: qtyText })}
      </p>
    );
  }

  function openEdit(row: Row) {
    setEditing(row);
    setEditDate(row.date);
    setEditKind(row.kind === "Product" ? "Product" : "Ingredient");
    setEditItemId(row.itemId);
    setEditQty(String(row.qty));
    setEditNote(row.note ?? "");
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
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setEditErr(t("common.formInvalid"));
      return;
    }
    setEditBusy(true);
    setEditErr("");
    try {
      await api(`/write-offs/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          date: editDate,
          kind: editKind,
          itemId: editItemId,
          qty: qtyNum,
          note: editNote,
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
      await api(`/write-offs/${pendingDelete.id}`, { method: "DELETE" });
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
        title={t("writeOffs.title")}
        description={t("writeOffs.description")}
        count={pageCount}
        actions={
          <ModalForm
            title={t("writeOffs.newTitle")}
            triggerLabel={t("common.add")}
            onSubmit={async () => {
              await api("/write-offs", {
                method: "POST",
                body: JSON.stringify({
                  date,
                  kind,
                  itemId,
                  qty: Number(q),
                  note,
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
              <span>{t("common.type")}</span>
              <SelectField
                value={kind}
                onChange={(v) => setKind(v as WriteOffKind)}
                searchable={false}
                options={[
                  { value: "Ingredient", label: t("writeOffs.kindIngredient") },
                  { value: "Product", label: t("writeOffs.kindProduct") },
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
              {stockHint(
                createStock.stock,
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
              {t("common.note")}
              <input value={note} onChange={(e) => setNote(e.target.value)} />
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
              key: "kind",
              label: t("common.type"),
              sortValue: (r) => r.kind,
              filterValue: (r) =>
                r.kind === "Ingredient"
                  ? t("writeOffs.kindIngredient")
                  : t("writeOffs.kindProduct"),
              render: (r) =>
                r.kind === "Ingredient"
                  ? t("writeOffs.kindIngredient")
                  : t("writeOffs.kindProduct"),
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
              key: "note",
              label: t("common.note"),
              sortValue: (r) => r.note,
              filterValue: (r) => r.note,
              render: (r) => r.note || "—",
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
        title={t("writeOffs.editTitle")}
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
              onChange={(v) => {
                const next = v as WriteOffKind;
                if (next === editKind) return;
                setEditKind(next);
                setEditQty("");
                setEditErr("");
              }}
              searchable={false}
              options={[
                { value: "Ingredient", label: t("writeOffs.kindIngredient") },
                { value: "Product", label: t("writeOffs.kindProduct") },
              ]}
            />
          </div>
          <div className="field">
            <span>{t("common.name")}</span>
            <SelectField
              value={editItemId}
              onChange={(v) => {
                if (v === editItemId) return;
                setEditItemId(v);
                setEditQty("");
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
            {t("common.note")}
            <input
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
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
        title={t("writeOffs.deleteTitle")}
        message={
          <div className="space-y-3">
            <p>{t("writeOffs.deleteConfirm")}</p>
            <p className="rounded-xl border border-amber/35 bg-amber/10 px-3.5 py-3 text-sm text-ink-soft">
              {t("writeOffs.deleteWarn")}
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
