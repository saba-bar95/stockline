import { useCallback, useEffect, useState } from "react";
import { DateField } from "../components/DateField";
import { DataTable } from "../components/DataTable";
import { ModalForm } from "../components/ModalForm";
import { SelectField } from "../components/SelectField";
import { PageHeader, Surface } from "../components/ui";
import { api, money, qty, today } from "../lib/api";
import { usePrefs } from "../preferences/PreferencesContext";

type Sale = {
  id: number;
  date: string;
  source: string;
  itemId: string;
  qty: number;
  unitPrice: number;
  revenue: number;
};
type Opt = { id: string; name: string };

export function SalesPage() {
  const { t, numberLocale } = usePrefs();
  const [rows, setRows] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Opt[]>([]);
  const [resale, setResale] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(today());
  const [source, setSource] = useState<"manufactured" | "resale">(
    "manufactured",
  );
  const [itemId, setItemId] = useState("");
  const [q, setQ] = useState("1");
  const [price, setPrice] = useState("0");

  const load = useCallback(async () => {
    try {
      const [s, p, r] = await Promise.all([
        api<Sale[]>("/sales"),
        api<Opt[]>("/products"),
        api<Opt[]>("/resale"),
      ]);
      setRows(s);
      setProducts(p);
      setResale(r);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const list = source === "manufactured" ? products : resale;
    if (list[0]) setItemId(list[0].id);
  }, [source, products, resale]);

  const options = source === "manufactured" ? products : resale;
  const names = Object.fromEntries(
    [...products, ...resale].map((o) => [o.id, o.name]),
  );

  return (
    <>
      <PageHeader
        title={t("sales.title")}
        description={t("sales.description")}
        actions={
          <ModalForm
            title={t("sales.newTitle")}
            triggerLabel={t("common.add")}
            onSubmit={async () => {
              await api("/sales", {
                method: "POST",
                body: JSON.stringify({
                  date,
                  source,
                  itemId,
                  qty: Number(q),
                  unitPrice: Number(price),
                }),
              });
              load();
            }}
          >
            <div className="field">
              <span>{t("common.date")}</span>
              <DateField value={date} onChange={setDate} />
            </div>
            <div className="field">
              <span>{t("common.source")}</span>
              <SelectField
                value={source}
                onChange={(v) =>
                  setSource(v as "manufactured" | "resale")
                }
                searchable={false}
                options={[
                  { value: "manufactured", label: t("sales.manufactured") },
                  { value: "resale", label: t("sales.resale") },
                ]}
              />
            </div>
            <div className="field">
              <span>{t("common.product")}</span>
              <SelectField
                value={itemId}
                onChange={setItemId}
                required
                options={options.map((o) => ({ value: o.id, label: o.name }))}
              />
            </div>
            <label className="field">
              {t("common.qty")}
              <input
                type="number"
                step="any"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <label className="field">
              {t("sales.sellPrice")}
              <input
                type="number"
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
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
              key: "source",
              label: t("common.source"),
              sortValue: (r) => r.source,
              filterValue: (r) =>
                r.source === "manufactured"
                  ? t("sales.manufactured")
                  : t("sales.resale"),
              render: (r) =>
                r.source === "manufactured"
                  ? t("sales.manufactured")
                  : t("sales.resale"),
            },
            {
              key: "itemId",
              label: t("common.name"),
              sortValue: (r) => names[r.itemId] ?? r.itemId,
              filterValue: (r) => `${r.itemId} ${names[r.itemId] ?? ""}`,
              render: (r) => names[r.itemId] ?? r.itemId,
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
              key: "unitPrice",
              label: t("common.price"),
              align: "right",
              sortValue: (r) => r.unitPrice,
              filterValue: (r) => String(r.unitPrice),
              render: (r) => money(r.unitPrice, numberLocale),
            },
            {
              key: "revenue",
              label: t("sales.revenue"),
              align: "right",
              sortValue: (r) => r.revenue,
              filterValue: (r) => String(r.revenue),
              render: (r) => money(r.revenue, numberLocale),
            },
          ]}
        />
      </Surface>
    </>
  );
}
