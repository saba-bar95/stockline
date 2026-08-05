import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "../components/ConfirmModal";
import { DataTable } from "../components/DataTable";
import { IngredientHistoryModal } from "../components/IngredientHistoryModal";
import { ModalForm } from "../components/ModalForm";
import { SelectField } from "../components/SelectField";
import { Button, PageHeader, Surface } from "../components/ui";
import { api, money, qty } from "../lib/api";
import { unitLabel } from "../i18n";
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
  const { t, locale, numberLocale, qtyDecimals } = usePrefs();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("kg");
  const [category, setCategory] = useState("");
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");

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

  async function confirmDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteErr("");
    try {
      await api(`/ingredients/${pendingDelete.id}`, { method: "DELETE" });
      if (historyId === pendingDelete.id) setHistoryId(null);
      setPendingDelete(null);
      await load();
    } catch (e) {
      setDeleteErr(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setDeleting(false);
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
                options={[
                  { value: "kg", label: t("units.kg") },
                  { value: "l", label: t("units.l") },
                  { value: "pc", label: t("units.pc") },
                ]}
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
              render: (r) => r.lastPurchaseDate ?? "—",
            },
            {
              key: "avgCost",
              label: t("ingredients.avgPrice"),
              title: t("ingredients.avgPriceFull"),
              filterable: false,
              sortValue: (r) => r.avgCost,
              render: (r) => money(r.avgCost, numberLocale),
            },
            {
              key: "stock",
              label: t("common.stock"),
              filterable: false,
              sortValue: (r) => r.stock,
              render: (r) => qty(r.stock, numberLocale, qtyDecimals),
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
                    className="min-w-22 text-danger hover:bg-danger/10 hover:text-danger"
                    disabled={deleting}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteErr("");
                      setPendingDelete(r);
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
      <ConfirmModal
        open={Boolean(pendingDelete)}
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
