import { useMemo, useState } from "react";
import { DataTable } from "./DataTable";
import { Modal } from "./Modal";
import { Button } from "./ui";
import { api, formatApiError, qty } from "../lib/api";
import { unitLabel } from "../i18n";
import { usePrefs } from "../preferences/PreferencesContext";

export type RecipeLineRow = {
  id: number;
  productId: string;
  ingredientId: string;
  qty: number;
  productName: string;
  ingredientName: string;
  unit: string;
};

type Props = {
  productId: string | null;
  productName: string;
  lines: RecipeLineRow[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
};

export function RecipeProductModal({
  productId,
  productName,
  lines,
  onClose,
  onChanged,
}: Props) {
  const { t, locale, numberLocale, qtyDecimals } = usePrefs();
  const [err, setErr] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const recipeLines = useMemo(
    () => (productId ? lines.filter((l) => l.productId === productId) : []),
    [lines, productId],
  );

  async function removeLine(id: number) {
    setDeletingId(id);
    setErr("");
    try {
      await api(`/recipes/${id}`, { method: "DELETE" });
      await onChanged();
    } catch (e) {
      setErr(formatApiError(e, t));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Modal
      title={
        productId
          ? t("recipes.titleNamed", { name: productName })
          : t("recipes.title")
      }
      open={!!productId}
      onClose={onClose}
      wide
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
            <span className="text-ink-muted">{t("recipes.perUnitHint")}</span>
          </div>
          {err ? <p className="mb-3 text-sm text-danger">{err}</p> : null}
          <DataTable
            rows={recipeLines}
            rowKey={(r) => r.id}
            defaultSortKey="ingredientName"
            searchable={false}
            emptyText={t("recipes.emptyProduct")}
            columns={[
              {
                key: "ingredientName",
                label: t("common.ingredient"),
                sortValue: (r) => r.ingredientName,
                filterValue: (r) => r.ingredientName,
                render: (r) => r.ingredientName,
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
                key: "actions",
                label: "",
                sortable: false,
                filterable: false,
                render: (r) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:bg-danger/10 hover:text-danger"
                    disabled={deletingId !== null}
                    onClick={() => void removeLine(r.id)}
                  >
                    {deletingId === r.id
                      ? t("common.deleting")
                      : t("common.delete")}
                  </Button>
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
  );
}
