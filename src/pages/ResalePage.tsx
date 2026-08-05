import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "../components/ConfirmModal";
import { DataTable } from "../components/DataTable";
import { ModalForm } from "../components/ModalForm";
import { ResaleHistoryModal } from "../components/ResaleHistoryModal";
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
  unitCost: number;
  stock: number;
  stockValue: number;
  lastPurchaseDate?: string | null;
  canDelete?: boolean;
};

export function ResalePage() {
  const { t, locale, numberLocale } = usePrefs();
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
      setRows(await api<Row[]>("/resale"));
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
      await api(`/resale/${pendingDelete.id}`, { method: "DELETE" });
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
        title={t("resale.title")}
        description={t("resale.description")}
        actions={
          <ModalForm
            title={t("resale.newTitle")}
            triggerLabel={t("common.add")}
            onSubmit={async () => {
              await api("/resale", {
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
            <div className="field">
              <span>{t("common.unit")}</span>
              <SelectField
                value={unit}
                onChange={setUnit}
                searchable={false}
                required
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
          emptyText={t("resale.empty")}
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
              filterValue: (r) => unitLabel(locale, r.unit),
              render: (r) => unitLabel(locale, r.unit),
            },
            {
              key: "category",
              label: t("common.category"),
              sortValue: (r) => r.category,
              filterValue: (r) => r.category,
              render: (r) => r.category || "—",
            },
            {
              key: "unitCost",
              label: t("resale.unitCost"),
              title: t("resale.unitCostFull"),
              align: "right",
              sortValue: (r) => r.unitCost,
              filterValue: (r) => String(r.unitCost),
              render: (r) => money(r.unitCost, numberLocale),
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
              key: "stockValue",
              label: t("resale.stockValue"),
              title: t("resale.stockValueFull"),
              align: "right",
              sortValue: (r) => r.stockValue,
              filterValue: (r) => String(r.stockValue),
              render: (r) => money(r.stockValue, numberLocale),
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
                    title={t("resale.deleteBlocked")}
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
        title={t("resale.deleteTitle")}
        message={t("resale.deleteConfirm", {
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
      <ResaleHistoryModal
        resaleId={historyId}
        onClose={() => setHistoryId(null)}
      />
    </>
  );
}
