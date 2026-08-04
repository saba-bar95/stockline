import { useCallback, useEffect, useState } from "react";
import { DateField } from "../components/DateField";
import { DataTable } from "../components/DataTable";
import { ModalForm } from "../components/ModalForm";
import { PageHeader, Surface } from "../components/ui";
import { api, qty, today } from "../lib/api";
import { usePrefs } from "../preferences/PreferencesContext";

type Row = {
  id: number;
  date: string;
  kind: string;
  itemId: string;
  qty: number;
  note: string;
};
type Opt = { id: string; name: string };

export function WriteOffsPage() {
  const { t, numberLocale } = usePrefs();
  const [rows, setRows] = useState<Row[]>([]);
  const [ings, setIngs] = useState<Opt[]>([]);
  const [prods, setProds] = useState<Opt[]>([]);
  const [resale, setResale] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(today());
  const [kind, setKind] = useState<"Ingredient" | "Product">("Ingredient");
  const [itemId, setItemId] = useState("");
  const [q, setQ] = useState("1");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const [w, i, p, r] = await Promise.all([
        api<Row[]>("/write-offs"),
        api<Opt[]>("/ingredients"),
        api<Opt[]>("/products"),
        api<Opt[]>("/resale"),
      ]);
      setRows(w);
      setIngs(i);
      setProds(p);
      setResale(r);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const options = kind === "Ingredient" ? ings : [...prods, ...resale];
  const names = Object.fromEntries(
    [...ings, ...prods, ...resale].map((o) => [o.id, o.name]),
  );

  useEffect(() => {
    if (options[0]) setItemId(options[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, ings, prods, resale]);

  return (
    <>
      <PageHeader
        title={t("writeOffs.title")}
        description={t("writeOffs.description")}
        actions={
          <ModalForm
            title={t("writeOffs.newTitle")}
            triggerLabel={t("common.add")}
            onSubmit={async () => {
              await api("/write-offs", {
                method: "POST",
                body: JSON.stringify({
                  date,
                  kind,
                  itemId,
                  qty: Number(q),
                  note,
                }),
              });
              load();
            }}
          >
            <div className="field">
              <span>{t("common.date")}</span>
              <DateField value={date} onChange={setDate} />
            </div>
            <label className="field">
              {t("common.type")}
              <select
                value={kind}
                onChange={(e) =>
                  setKind(e.target.value as "Ingredient" | "Product")
                }
              >
                <option value="Ingredient">
                  {t("writeOffs.kindIngredient")}
                </option>
                <option value="Product">{t("writeOffs.kindProduct")}</option>
              </select>
            </label>
            <label className="field">
              {t("common.name")}
              <select
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
              >
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
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
            <label className="field">
              {t("common.note")}
              <input value={note} onChange={(e) => setNote(e.target.value)} />
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
              key: "kind",
              label: t("common.type"),
              sortValue: (r) => r.kind,
              filterValue: (r) =>
                r.kind === "Ingredient"
                  ? t("writeOffs.kindIngredient")
                  : t("writeOffs.kindProduct"),
              render: (r) =>
                r.kind === "Ingredient"
                  ? t("writeOffs.kindIngredient")
                  : t("writeOffs.kindProduct"),
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
              key: "note",
              label: t("common.note"),
              sortValue: (r) => r.note,
              filterValue: (r) => r.note,
              render: (r) => r.note || "—",
            },
          ]}
        />
      </Surface>
    </>
  );
}
