import { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable } from "../components/DataTable";
import { IngredientHistoryModal } from "../components/IngredientHistoryModal";
import { ModalForm } from "../components/ModalForm";
import { Button, PageHeader, Surface } from "../components/ui";
import { api, money, qty } from "../lib/api";
import { usePrefs } from "../preferences/PreferencesContext";

type Row = {
  id: string;
  name: string;
  unit: string;
  category: string;
  avgCost: number;
  stock: number;
  lastPurchaseDate: string | null;
  canDelete?: boolean;
};

export function IngredientsPage() {
  const { t, numberLocale } = usePrefs();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("კგ");
  const [category, setCategory] = useState("");
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
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

  async function removeIngredient(row: Row) {
    if (!row.canDelete || deletingId) return;
    const ok = window.confirm(
      t("ingredients.deleteConfirm", { name: row.name }),
    );
    if (!ok) return;
    setDeletingId(row.id);
    try {
      await api(`/ingredients/${row.id}`, { method: "DELETE" });
      if (historyId === row.id) setHistoryId(null);
      load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title={t("ingredients.title")}
        description={t("ingredients.description")}
        actions={
          <ModalForm
            title={t("ingredients.newTitle")}
            triggerLabel={t("common.add")}
            onSubmit={async () => {
              await api("/ingredients", {
                method: "POST",
                body: JSON.stringify({ name, unit, category }),
              });
              setName("");
              setCategory("");
              load();
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
            <label className="field">
              {t("common.unit")}
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="კგ">{t("units.kg")}</option>
                <option value="ლ">{t("units.l")}</option>
                <option value="გ">{t("units.g")}</option>
              </select>
            </label>
            <label className="field">
              {t("common.category")}
              <input
                list="ingredient-categories"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={t("ingredients.categoryHint")}
              />
              <datalist id="ingredient-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
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
              sortValue: (r) => r.unit,
              filterValue: (r) => r.unit,
              render: (r) => r.unit,
            },
            {
              key: "category",
              label: t("common.category"),
              sortValue: (r) => r.category,
              filterValue: (r) => r.category,
              render: (r) => r.category || "—",
            },
            {
              key: "lastPurchaseDate",
              label: t("ingredients.lastPurchase"),
              title: t("ingredients.lastPurchaseFull"),
              sortValue: (r) => r.lastPurchaseDate ?? "",
              filterValue: (r) => r.lastPurchaseDate ?? "",
              render: (r) => r.lastPurchaseDate ?? "—",
            },
            {
              key: "avgCost",
              label: t("ingredients.avgPrice"),
              title: t("ingredients.avgPriceFull"),
              align: "right",
              sortValue: (r) => r.avgCost,
              filterValue: (r) => String(r.avgCost),
              render: (r) => money(r.avgCost, numberLocale),
            },
            {
              key: "stock",
              label: t("common.stock"),
              align: "right",
              sortValue: (r) => r.stock,
              filterValue: (r) => String(r.stock),
              render: (r) => qty(r.stock, numberLocale),
            },
            {
              key: "actions",
              label: "",
              sortable: false,
              filterable: false,
              render: (r) =>
                r.canDelete ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:bg-danger/10 hover:text-danger"
                    disabled={deletingId === r.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeIngredient(r);
                    }}
                  >
                    {t("common.delete")}
                  </Button>
                ) : (
                  <span
                    className="text-xs text-ink-muted"
                    title={t("ingredients.deleteBlocked")}
                  >
                    —
                  </span>
                ),
            },
          ]}
        />
      </Surface>
      <IngredientHistoryModal
        ingredientId={historyId}
        onClose={() => setHistoryId(null)}
      />
    </>
  );
}
