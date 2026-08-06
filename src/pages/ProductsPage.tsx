import { useCallback, useEffect, useState } from "react";
import { DataTable } from "../components/DataTable";
import { ModalForm } from "../components/ModalForm";
import { ProductHistoryModal } from "../components/ProductHistoryModal";
import { SelectField } from "../components/SelectField";
import { PageHeader, Surface } from "../components/ui";
import { api, money, qty } from "../lib/api";
import { unitLabel } from "../i18n";
import { usePrefs } from "../preferences/PreferencesContext";
import { usePageCount } from "../preferences/CountsContext";

type Row = {
  id: string;
  name: string;
  unit: string;
  qtyIn: number | null;
  unitCost: number | null;
  ohUnitCost: number | null;
  ohTotal: number | null;
  fullUnitCost: number | null;
  fullTotal: number | null;
  stock: number | null;
  stockValue: number | null;
  recommendedPrice: number | null;
  metricsPending?: boolean;
};

export function ProductsPage() {
  const { t, locale, numberLocale, qtyDecimals } = usePrefs();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("kg");
  const [historyId, setHistoryId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const bare = await api<Array<Pick<Row, "id" | "name" | "unit">>>(
        "/products?minimal=1",
      );
      setRows(
        bare.map((r) => ({
          ...r,
          qtyIn: null,
          unitCost: null,
          ohUnitCost: null,
          ohTotal: null,
          fullUnitCost: null,
          fullTotal: null,
          stock: null,
          stockValue: null,
          recommendedPrice: null,
          metricsPending: true,
        })),
      );
      setLoading(false);
      setRows(await api<Row[]>("/products"));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const pageCount = usePageCount("products", loading ? null : rows.length);

  return (
    <>
      <PageHeader
        title={t("products.title")}
        description={t("products.description")}
        count={pageCount}
        actions={
          <ModalForm
            title={t("products.newTitle")}
            triggerLabel={t("common.add")}
            onSubmit={async () => {
              await api("/products", {
                method: "POST",
                body: JSON.stringify({ name, unit }),
              });
              setName("");
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
                options={[
                  { value: "kg", label: t("units.kg") },
                  { value: "l", label: t("units.l") },
                  { value: "pc", label: t("units.pc") },
                ]}
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
              label: t("common.unitShort"),
              title: t("common.unit"),
              sortValue: (r) => r.unit,
              filterValue: (r) => unitLabel(locale, r.unit),
              render: (r) => unitLabel(locale, r.unit),
            },
            {
              key: "unitCost",
              label: t("products.ingPerUnit"),
              title: t("products.ingPerUnitFull"),
              align: "right",
              sortValue: (r) => r.unitCost ?? -1,
              filterValue: (r) => String(r.unitCost ?? ""),
              render: (r) =>
                r.metricsPending || r.unitCost == null
                  ? "…"
                  : money(r.unitCost, numberLocale),
            },
            {
              key: "ohTotal",
              label: t("products.ohTotal"),
              title: t("products.ohTotalFull"),
              align: "right",
              sortValue: (r) => r.ohTotal ?? -1,
              filterValue: (r) => String(r.ohTotal ?? ""),
              render: (r) =>
                r.metricsPending || r.ohTotal == null
                  ? "…"
                  : money(r.ohTotal, numberLocale),
            },
            {
              key: "fullUnitCost",
              label: t("products.fullUnit"),
              title: t("products.fullUnitFull"),
              align: "right",
              sortValue: (r) => r.fullUnitCost ?? -1,
              filterValue: (r) => String(r.fullUnitCost ?? ""),
              render: (r) =>
                r.metricsPending || r.fullUnitCost == null
                  ? "…"
                  : money(r.fullUnitCost, numberLocale),
            },
            {
              key: "stock",
              label: t("common.stock"),
              align: "right",
              sortValue: (r) => r.stock ?? -1,
              filterValue: (r) => String(r.stock ?? ""),
              render: (r) =>
                r.metricsPending || r.stock == null
                  ? "…"
                  : qty(r.stock, numberLocale, qtyDecimals),
            },
            {
              key: "stockValue",
              label: t("products.stockValue"),
              title: t("products.stockValueFull"),
              align: "right",
              sortValue: (r) => r.stockValue ?? -1,
              filterValue: (r) => String(r.stockValue ?? ""),
              render: (r) =>
                r.metricsPending || r.stockValue == null
                  ? "…"
                  : money(r.stockValue, numberLocale),
            },
            {
              key: "recommendedPrice",
              label: t("products.recommended"),
              title: t("products.recommendedFull"),
              align: "right",
              sortValue: (r) => r.recommendedPrice ?? -1,
              filterValue: (r) => String(r.recommendedPrice ?? ""),
              render: (r) =>
                r.metricsPending || r.recommendedPrice == null
                  ? "…"
                  : money(r.recommendedPrice, numberLocale),
            },
          ]}
        />
      </Surface>
      <ProductHistoryModal
        productId={historyId}
        onClose={() => setHistoryId(null)}
      />
    </>
  );
}
