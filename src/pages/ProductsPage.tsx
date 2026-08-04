import { useCallback, useEffect, useState } from "react";
import { DataTable } from "../components/DataTable";
import { ModalForm } from "../components/ModalForm";
import { PageHeader, Surface } from "../components/ui";
import { api, money, qty } from "../lib/api";
import { usePrefs } from "../preferences/PreferencesContext";

type Row = {
  id: string;
  name: string;
  unit: string;
  qtyIn: number;
  unitCost: number;
  ohUnitCost: number;
  ohTotal: number;
  fullUnitCost: number;
  fullTotal: number;
  stock: number;
  stockValue: number;
  recommendedPrice: number;
};

export function ProductsPage() {
  const { t, numberLocale } = usePrefs();
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("კგ");

  const load = useCallback(() => api<Row[]>("/products").then(setRows), []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PageHeader
        title={t("products.title")}
        description={t("products.description")}
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
            <label className="field">
              {t("common.unit")}
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="კგ">{t("units.kg")}</option>
                <option value="ლ">{t("units.l")}</option>
              </select>
            </label>
          </ModalForm>
        }
      />
      <Surface>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
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
              filterValue: (r) => r.unit,
              render: (r) => r.unit,
            },
            {
              key: "unitCost",
              label: t("products.ingPerUnit"),
              title: t("products.ingPerUnitFull"),
              align: "right",
              sortValue: (r) => r.unitCost,
              filterValue: (r) => String(r.unitCost),
              render: (r) => money(r.unitCost, numberLocale),
            },
            {
              key: "ohTotal",
              label: t("products.ohTotal"),
              title: t("products.ohTotalFull"),
              align: "right",
              sortValue: (r) => r.ohTotal,
              filterValue: (r) => String(r.ohTotal),
              render: (r) => money(r.ohTotal, numberLocale),
            },
            {
              key: "fullUnitCost",
              label: t("products.fullUnit"),
              title: t("products.fullUnitFull"),
              align: "right",
              sortValue: (r) => r.fullUnitCost,
              filterValue: (r) => String(r.fullUnitCost),
              render: (r) => money(r.fullUnitCost, numberLocale),
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
              label: t("products.stockValue"),
              title: t("products.stockValueFull"),
              align: "right",
              sortValue: (r) => r.stockValue,
              filterValue: (r) => String(r.stockValue),
              render: (r) => money(r.stockValue, numberLocale),
            },
            {
              key: "recommendedPrice",
              label: t("products.recommended"),
              title: t("products.recommendedFull"),
              align: "right",
              sortValue: (r) => r.recommendedPrice,
              filterValue: (r) => String(r.recommendedPrice),
              render: (r) => money(r.recommendedPrice, numberLocale),
            },
          ]}
        />
      </Surface>
    </>
  );
}
