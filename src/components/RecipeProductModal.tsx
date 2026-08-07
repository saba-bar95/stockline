import { useMemo, useState } from "react";
import { ConfirmModal } from "./ConfirmModal";
import { DataTable } from "./DataTable";
import { Modal } from "./Modal";
import { Button } from "./ui";
import { api, formatApiError, money, qty } from "../lib/api";
import { unitLabel } from "../i18n";
import { usePrefs } from "../preferences/PreferencesContext";

export type RecipeLineRow = {
  id: number;
  productId: string;
  ingredientId: string;
  qty: number;
  productName: string;
  productUnit?: string;
  ingredientName: string;
  unit: string;
  avgCost?: number;
  lineCost?: number;
  canDelete?: boolean;
  nullified?: boolean;
};

type Props = {
  productId: string | null;
  productName: string;
  productUnit?: string;
  lines: RecipeLineRow[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
};

export function RecipeProductModal({
  productId,
  productName,
  productUnit = "",
  lines,
  onClose,
  onChanged,
}: Props) {
  const { t, locale, numberLocale, qtyDecimals } = usePrefs();
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const [editing, setEditing] = useState<RecipeLineRow | null>(null);
  const [editQty, setEditQty] = useState("1");
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState("");

  const [pendingNullify, setPendingNullify] = useState<RecipeLineRow | null>(
    null,
  );
  const [nullifyBusy, setNullifyBusy] = useState(false);
  const [nullifyErr, setNullifyErr] = useState("");

  const recipeLines = useMemo(
    () => (productId ? lines.filter((l) => l.productId === productId) : []),
    [lines, productId],
  );

  const resolvedUnit = productUnit || recipeLines[0]?.productUnit || "";
  const unitCostTotal = useMemo(
    () =>
      recipeLines.reduce(
        (sum, l) => sum + (Number(l.qty) > 0 ? (l.lineCost ?? 0) : 0),
        0,
      ),
    [recipeLines],
  );

  function openEdit(row: RecipeLineRow) {
    setEditing(row);
    setEditQty(String(row.qty));
    setEditErr("");
    setErr("");
  }

  function closeEdit() {
    if (editBusy) return;
    setEditing(null);
    setEditErr("");
  }

  async function saveEdit() {
    if (!editing || editBusy) return;
    const qtyNum = Number(editQty);
    if (!Number.isFinite(qtyNum) || qtyNum < 0) {
      setEditErr(t("common.formInvalid"));
      return;
    }
    setEditBusy(true);
    setEditErr("");
    try {
      await api(`/recipes/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ qty: qtyNum }),
      });
      setEditing(null);
      await onChanged();
    } catch (e) {
      setEditErr(formatApiError(e, t));
    } finally {
      setEditBusy(false);
    }
  }

  async function removeLine(id: number) {
    setBusyId(id);
    setErr("");
    try {
      await api(`/recipes/${id}`, { method: "DELETE" });
      await onChanged();
    } catch (e) {
      setErr(formatApiError(e, t));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmNullify() {
    if (!pendingNullify || nullifyBusy) return;
    setNullifyBusy(true);
    setNullifyErr("");
    try {
      await api(`/recipes/${pendingNullify.id}`, {
        method: "PATCH",
        body: JSON.stringify({ qty: 0 }),
      });
      setPendingNullify(null);
      await onChanged();
    } catch (e) {
      setNullifyErr(formatApiError(e, t));
    } finally {
      setNullifyBusy(false);
    }
  }

  const actionsLocked =
    busyId !== null || editBusy || nullifyBusy || Boolean(pendingNullify);

  return (
    <>
      <Modal
        title={
          productId
            ? t("recipes.titleNamed", { name: productName })
            : t("recipes.title")
        }
        open={!!productId}
        onClose={onClose}
        wide
        listenKeys={!editing && !pendingNullify}
      >
        {productId ? (
          <>
            <div className="mb-5 flex flex-wrap gap-x-5 gap-y-2 rounded-xl bg-paper px-4 py-3 text-sm text-ink-soft">
              <span>
                ID: <strong className="mono text-ink">{productId}</strong>
              </span>
              <span>
                {t("recipes.lines")}:{" "}
                <strong className="text-ink">{recipeLines.length}</strong>
              </span>
              <span className="text-ink-muted">
                {t("recipes.perUnitHint", {
                  unit: resolvedUnit
                    ? unitLabel(locale, resolvedUnit)
                    : t("common.unit"),
                })}
              </span>
            </div>
            {err ? <p className="mb-3 text-sm text-danger">{err}</p> : null}
            <DataTable
              rows={recipeLines}
              rowKey={(r) => r.id}
              defaultSortKey="ingredientName"
              searchable={false}
              emptyText={t("recipes.emptyProduct")}
              scrollOnPageChange={false}
              footer={
                recipeLines.length > 0
                  ? {
                      ingredientName: (
                        <span title={t("recipes.unitCostTotalFull")}>
                          {t("common.total")}
                        </span>
                      ),
                      lineCost: (
                        <span title={t("recipes.unitCostTotalFull")}>
                          {money(unitCostTotal, numberLocale)}
                        </span>
                      ),
                    }
                  : undefined
              }
              columns={[
                {
                  key: "ingredientName",
                  label: t("common.ingredient"),
                  sortValue: (r) => r.ingredientName,
                  filterValue: (r) => r.ingredientName,
                  render: (r) => (
                    <span
                      className={
                        r.nullified || r.qty <= 0
                          ? "text-ink-muted line-through"
                          : undefined
                      }
                    >
                      {r.ingredientName}
                      {r.nullified || r.qty <= 0 ? (
                        <span className="ml-2 text-xs no-underline">
                          ({t("recipes.nullified")})
                        </span>
                      ) : null}
                    </span>
                  ),
                },
                {
                  key: "qty",
                  label: t("common.qty"),
                  align: "right",
                  sortValue: (r) => r.qty,
                  filterValue: (r) => String(r.qty),
                  render: (r) => qty(r.qty, numberLocale, qtyDecimals),
                },
                {
                  key: "unit",
                  label: t("common.unit"),
                  sortValue: (r) => r.unit,
                  filterValue: (r) => unitLabel(locale, r.unit),
                  render: (r) => unitLabel(locale, r.unit),
                },
                {
                  key: "avgCost",
                  label: t("ingredients.avgPrice"),
                  title: t("ingredients.avgPriceFull"),
                  align: "right",
                  filterable: false,
                  sortValue: (r) => r.avgCost ?? 0,
                  render: (r) => money(r.avgCost ?? 0, numberLocale),
                },
                {
                  key: "lineCost",
                  label: t("recipes.lineCost"),
                  title: t("recipes.lineCostFull"),
                  align: "right",
                  filterable: false,
                  sortValue: (r) => r.lineCost ?? 0,
                  render: (r) => money(r.lineCost ?? 0, numberLocale),
                },
                {
                  key: "actions",
                  label: "",
                  sortable: false,
                  filterable: false,
                  render: (r) => (
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-w-18"
                        disabled={actionsLocked}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(r);
                        }}
                      >
                        {t("common.edit")}
                      </Button>
                      {r.canDelete !== false ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger hover:bg-danger/10 hover:text-danger"
                          disabled={actionsLocked}
                          onClick={(e) => {
                            e.stopPropagation();
                            void removeLine(r.id);
                          }}
                        >
                          {busyId === r.id
                            ? t("common.deleting")
                            : t("common.delete")}
                        </Button>
                      ) : r.qty > 0 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-amber hover:bg-amber/10"
                          disabled={actionsLocked}
                          onClick={(e) => {
                            e.stopPropagation();
                            setNullifyErr("");
                            setPendingNullify(r);
                          }}
                        >
                          {t("recipes.nullify")}
                        </Button>
                      ) : null}
                    </div>
                  ),
                },
              ]}
            />
            <p className="mt-4 text-xs text-ink-muted">
              {t("recipes.deleteHint")}
            </p>
          </>
        ) : null}
      </Modal>

      <Modal
        title={t("recipes.editTitle")}
        open={Boolean(editing)}
        onClose={closeEdit}
        stacked
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
            <p className="mb-3 text-sm text-ink-soft">
              {editing.ingredientName}
            </p>
          ) : null}
          <label className="field">
            {t("common.qty")}
            <input
              type="number"
              step="any"
              min="0"
              value={editQty}
              onChange={(e) => setEditQty(e.target.value)}
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
          <div className="mt-6 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={closeEdit}
              disabled={editBusy}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={editBusy}>
              {editBusy ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(pendingNullify)}
        stacked
        title={t("recipes.nullifyTitle")}
        message={<p>{t("recipes.nullifyConfirm")}</p>}
        error={nullifyErr}
        busy={nullifyBusy}
        confirmLabel={t("recipes.nullify")}
        onCancel={() => {
          if (nullifyBusy) return;
          setPendingNullify(null);
          setNullifyErr("");
        }}
        onConfirm={() => void confirmNullify()}
      />
    </>
  );
}
