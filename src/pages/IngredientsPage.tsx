import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "../components/ConfirmModal";
import { DataTable } from "../components/DataTable";
import { IngredientHistoryModal } from "../components/IngredientHistoryModal";
import { Modal } from "../components/Modal";
import { ModalForm } from "../components/ModalForm";
import { SelectField } from "../components/SelectField";
import { Button, PageHeader, Surface } from "../components/ui";
import { api, formatApiError, money, qty } from "../lib/api";
import { unitLabel } from "../i18n";
import { canonicalUnit, sameUnit } from "../lib/units";
import { usePrefs } from "../preferences/PreferencesContext";
import { usePageCount } from "../preferences/CountsContext";

type Row = {
  id: string;
  name: string;
  unit: string;
  category: string;
  avgCost: number | null;
  stock: number | null;
  lastPurchaseDate: string | null;
  canDelete?: boolean;
  metricsPending?: boolean;
};

const UNIT_OPTIONS = [
  { value: "kg", labelKey: "units.kg" as const },
  { value: "l", labelKey: "units.l" as const },
  { value: "pc", labelKey: "units.pc" as const },
];

export function IngredientsPage() {
  const { t, locale, numberLocale, qtyDecimals } = usePrefs();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("kg");
  const [category, setCategory] = useState("");
  const [historyId, setHistoryId] = useState<string | null>(null);

  const [editing, setEditing] = useState<Row | null>(null);
  const [editName, setEditName] = useState("");
  const [editUnit, setEditUnit] = useState("kg");
  const [editCategory, setEditCategory] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");
  const [pendingUnitChange, setPendingUnitChange] = useState(false);

  const pageCount = usePageCount("ingredients", loading ? null : rows.length);
  const load = useCallback(async () => {
    try {
      const bare = await api<
        Array<Pick<Row, "id" | "name" | "unit" | "category">>
      >("/ingredients?minimal=1");
      setRows(
        bare.map((r) => ({
          ...r,
          avgCost: null,
          stock: null,
          lastPurchaseDate: null,
          metricsPending: true,
        })),
      );
      setLoading(false);
      setRows(await api<Row[]>("/ingredients"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const c = r.category.trim();
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ka"));
  }, [rows]);

  function openEdit(row: Row) {
    setEditing(row);
    setEditName(row.name);
    setEditUnit(canonicalUnit(row.unit) ?? row.unit);
    setEditCategory(row.category);
    setEditErr("");
    setDeleteErr("");
    setPendingDelete(null);
    setPendingUnitChange(false);
  }

  function closeEdit() {
    if (editBusy || deleting) return;
    setEditing(null);
    setEditErr("");
    setPendingDelete(null);
    setPendingUnitChange(false);
    setDeleteErr("");
  }

  async function saveEdit(confirmedUnitChange = false) {
    if (!editing || editBusy || deleting) return;
    const trimmedName = editName.trim();
    const trimmedCategory = editCategory.trim();
    if (!trimmedName) {
      setEditErr(t("common.formInvalid"));
      return;
    }
    if (!trimmedCategory) {
      setEditErr(t("ingredients.categoryRequired"));
      return;
    }
    const nextUnit = canonicalUnit(editUnit) ?? editUnit.trim();
    if (!nextUnit) {
      setEditErr(t("common.formInvalid"));
      return;
    }
    if (
      !sameUnit(editing.unit, nextUnit) &&
      editing.canDelete === false &&
      !confirmedUnitChange
    ) {
      setPendingUnitChange(true);
      return;
    }
    setPendingUnitChange(false);
    setEditBusy(true);
    setEditErr("");
    try {
      await api(`/ingredients/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: trimmedName,
          unit: nextUnit,
          category: trimmedCategory,
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
      await api(`/ingredients/${pendingDelete.id}`, { method: "DELETE" });
      if (historyId === pendingDelete.id) setHistoryId(null);
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
        title={t("ingredients.title")}
        description={t("ingredients.description")}
        count={pageCount}
        actions={
          <ModalForm
            title={t("ingredients.newTitle")}
            triggerLabel={t("common.add")}
            onSubmit={async () => {
              const cat = category.trim();
              if (!cat) {
                throw new Error(t("ingredients.categoryRequired"));
              }
              await api("/ingredients", {
                method: "POST",
                body: JSON.stringify({ name, unit, category: cat }),
              });
              setName("");
              setCategory("");
              await load();
            }}
          >
            <label className="field">
              {t("common.name")}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <div className="field">
              <span>{t("common.unit")}</span>
              <SelectField
                value={unit}
                onChange={setUnit}
                searchable={false}
                required
                options={UNIT_OPTIONS.map((o) => ({
                  value: o.value,
                  label: t(o.labelKey),
                }))}
              />
            </div>
            <div className="field">
              <span>{t("common.category")}</span>
              <SelectField
                value={category}
                onChange={setCategory}
                allowCustom
                required
                placeholder={t("ingredients.categoryHint")}
                options={categories.map((c) => ({ value: c, label: c }))}
              />
            </div>
          </ModalForm>
        }
      />
      <Surface>
        <DataTable
          rows={rows}
          loading={loading}
          rowKey={(r) => r.id}
          onRowClick={(r) => setHistoryId(r.id)}
          defaultSortKey="name"
          emptyText={t("ingredients.empty")}
          columns={[
            {
              key: "id",
              label: "ID",
              sortValue: (r) => r.id,
              filterValue: (r) => r.id,
              render: (r) => <span className="mono">{r.id}</span>,
            },
            {
              key: "name",
              label: t("common.name"),
              sortValue: (r) => r.name,
              filterValue: (r) => r.name,
              render: (r) => r.name,
            },
            {
              key: "unit",
              label: t("common.unit"),
              filterType: "select",
              sortValue: (r) => r.unit,
              filterValue: (r) => unitLabel(locale, r.unit),
              render: (r) => unitLabel(locale, r.unit),
            },
            {
              key: "category",
              label: t("common.category"),
              filterType: "select",
              sortValue: (r) => r.category,
              filterValue: (r) => r.category || "—",
              render: (r) => r.category || "—",
            },
            {
              key: "lastPurchaseDate",
              label: t("ingredients.lastPurchase"),
              title: t("ingredients.lastPurchaseFull"),
              filterable: false,
              sortValue: (r) => r.lastPurchaseDate ?? "",
              render: (r) =>
                r.metricsPending ? "…" : (r.lastPurchaseDate ?? "—"),
            },
            {
              key: "avgCost",
              label: t("ingredients.avgPrice"),
              title: t("ingredients.avgPriceFull"),
              filterable: false,
              sortValue: (r) => r.avgCost ?? -1,
              render: (r) =>
                r.metricsPending || r.avgCost == null
                  ? "…"
                  : money(r.avgCost, numberLocale),
            },
            {
              key: "stock",
              label: t("common.stock"),
              filterable: false,
              sortValue: (r) => r.stock ?? -1,
              render: (r) =>
                r.metricsPending || r.stock == null
                  ? "…"
                  : qty(r.stock, numberLocale, qtyDecimals),
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
        title={t("ingredients.editTitle")}
        open={Boolean(editing)}
        onClose={closeEdit}
        listenKeys={!pendingDelete && !pendingUnitChange}
      >
        <form
          noValidate
          className="space-y-1"
          onSubmit={(e) => {
            e.preventDefault();
            void saveEdit();
          }}
        >
          {editing ? (
            <p className="mb-3 text-sm text-ink-muted">
              ID: <strong className="mono text-ink">{editing.id}</strong>
            </p>
          ) : null}
          <label className="field">
            {t("common.name")}
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
            />
          </label>
          <div className="field">
            <span>{t("common.unit")}</span>
            <SelectField
              value={editUnit}
              onChange={setEditUnit}
              searchable={false}
              required
              options={[
                ...UNIT_OPTIONS.map((o) => ({
                  value: o.value,
                  label: t(o.labelKey),
                })),
                ...(editUnit &&
                !UNIT_OPTIONS.some((o) => o.value === editUnit)
                  ? [{ value: editUnit, label: unitLabel(locale, editUnit) }]
                  : []),
              ]}
            />
            {editing?.canDelete === false &&
            !sameUnit(editing.unit, editUnit) ? (
              <p className="mt-1.5 text-xs text-amber">
                {t("ingredients.unitCaution")}
              </p>
            ) : null}
          </div>
          <div className="field">
            <span>{t("common.category")}</span>
            <SelectField
              value={editCategory}
              onChange={setEditCategory}
              allowCustom
              required
              placeholder={t("ingredients.categoryHint")}
              options={categories.map((c) => ({ value: c, label: c }))}
            />
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
            {editing?.canDelete ? (
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
            ) : (
              <span />
            )}
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
        open={pendingUnitChange}
        stacked
        title={t("ingredients.unitChangeTitle")}
        message={t("ingredients.unitChangeConfirm")}
        confirmLabel={t("common.save")}
        confirmVariant="primary"
        onCancel={() => setPendingUnitChange(false)}
        onConfirm={() => void saveEdit(true)}
      />

      <ConfirmModal
        open={Boolean(pendingDelete)}
        stacked
        title={t("ingredients.deleteTitle")}
        message={t("ingredients.deleteConfirm", {
          name: pendingDelete?.name ?? "",
        })}
        error={deleteErr}
        busy={deleting}
        onCancel={() => {
          if (deleting) return;
          setPendingDelete(null);
          setDeleteErr("");
        }}
        onConfirm={() => void confirmDelete()}
      />

      <IngredientHistoryModal
        ingredientId={historyId}
        onClose={() => setHistoryId(null)}
      />
    </>
  );
}
