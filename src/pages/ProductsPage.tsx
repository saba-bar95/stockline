import { useCallback, useEffect, useState } from "react";
import { DataTable } from "../components/DataTable";
import { ModalForm } from "../components/ModalForm";
import { SelectField } from "../components/SelectField";
import { PageHeader, Surface } from "../components/ui";
import { api, money, qty } from "../lib/api";
import { unitLabel } from "../i18n";
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
  const { t, locale, numberLocale } = usePrefs();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("kg");

  const load = useCallback(async () => {
    try {
      setRows(await api<Row[]>("/products"));
    } finally {
      setLoading(false);
    }
  }, []);
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
