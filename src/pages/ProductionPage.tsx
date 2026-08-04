import { useCallback, useEffect, useState } from "react";
import { DateField } from "../components/DateField";
import { DataTable } from "../components/DataTable";
import { ModalForm } from "../components/ModalForm";
import { PageHeader, Surface } from "../components/ui";
import { api, money, qty, today } from "../lib/api";
import { usePrefs } from "../preferences/PreferencesContext";

type Run = {
  id: number;
  date: string;
  productId: string;
  productName: string;
  qty: number;
  ingredientCost: number;
  overheadCost: number;
  fullCost: number;
  unitCost: number;
};
type Opt = { id: string; name: string };

export function ProductionPage() {
  const { t, numberLocale } = usePrefs();
  const [rows, setRows] = useState<Run[]>([]);
  const [products, setProducts] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(today());
  const [productId, setProductId] = useState("");
  const [q, setQ] = useState("1");

  const load = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([
        api<Run[]>("/production"),
        api<Opt[]>("/products"),
      ]);
      setRows(r);
      setProducts(p);
      if (!productId && p[0]) setProductId(p[0].id);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHeader
        title={t("production.title")}
        description={t("production.description")}
        actions={
          <ModalForm
            title={t("production.newTitle")}
            triggerLabel={t("common.add")}
            onSubmit={async () => {
              await api("/production", {
                method: "POST",
                body: JSON.stringify({ date, productId, qty: Number(q) }),
              });
              load();
            }}
          >
            <div className="field">
              <span>{t("common.date")}</span>
              <DateField value={date} onChange={setDate} />
            </div>
            <label className="field">
              {t("common.product")}
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t("common.qty")}
              <input
                type="number"
                step="any"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
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
              key: "productName",
              label: t("common.product"),
              sortValue: (r) => r.productName,
              filterValue: (r) => `${r.productName} ${r.productId}`,
              render: (r) => r.productName,
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
              key: "unitCost",
              label: t("production.unitCost"),
              title: t("production.unitCostFull"),
              align: "right",
              sortValue: (r) => r.unitCost,
              filterValue: (r) => String(r.unitCost),
              render: (r) => money(r.unitCost, numberLocale),
            },
            {
              key: "ingredientCost",
              label: t("production.ingTotal"),
              title: t("production.ingTotalFull"),
              align: "right",
              sortValue: (r) => r.ingredientCost,
              filterValue: (r) => String(r.ingredientCost),
              render: (r) => money(r.ingredientCost, numberLocale),
            },
            {
              key: "overheadCost",
              label: t("production.overhead"),
              title: t("production.overheadFull"),
              align: "right",
              sortValue: (r) => r.overheadCost,
              filterValue: (r) => String(r.overheadCost),
              render: (r) => money(r.overheadCost, numberLocale),
            },
            {
              key: "fullCost",
              label: t("production.fullCost"),
              title: t("production.fullCostFull"),
              align: "right",
              sortValue: (r) => r.fullCost,
              filterValue: (r) => String(r.fullCost),
              render: (r) => money(r.fullCost, numberLocale),
            },
          ]}
        />
      </Surface>
    </>
  );
}
