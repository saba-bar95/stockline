import { useEffect, useState } from "react";
import { api, money, qty } from "../lib/api";
import { movementLabel } from "../i18n";
import { usePrefs } from "../preferences/PreferencesContext";
import { DataTable } from "./DataTable";
import { Modal } from "./Modal";
import { LoadingState } from "./ui";

type Movement = {
  date: string;
  type: string;
  qty: number;
  unitPrice: number;
  total: number;
  note: string;
};

type HistoryPayload = {
  ingredient: {
    id: string;
    name: string;
    unit: string;
    category: string;
    avgCost: number;
    stock: number;
    lastPurchaseDate: string | null;
  };
  movements: Movement[];
};

type Props = {
  ingredientId: string | null;
  onClose: () => void;
};

export function IngredientHistoryModal({ ingredientId, onClose }: Props) {
  const { t, locale, numberLocale } = usePrefs();
  const [data, setData] = useState<HistoryPayload | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!ingredientId) {
      setData(null);
      return;
    }
    setData(null);
    setErr("");
    api<HistoryPayload>(`/ingredients/${ingredientId}/history`)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : t("common.error")));
  }, [ingredientId, t]);

  const ing = data?.ingredient;

  return (
    <Modal
      title={
        ing ? t("history.titleNamed", { name: ing.name }) : t("history.title")
      }
      open={!!ingredientId}
      onClose={onClose}
      wide
    >
      {err ? <p className="mb-3 text-sm text-danger">{err}</p> : null}
      {!data && !err ? (
        <LoadingState label={t("common.loading")} className="py-10" />
      ) : null}
      {ing && data ? (
        <>
          <div className="mb-5 flex flex-wrap gap-x-5 gap-y-2 rounded-xl bg-paper px-4 py-3 text-sm text-ink-soft">
            <span>
              ID: <strong className="mono text-ink">{ing.id}</strong>
            </span>
            <span>
              {t("history.unit")}:{" "}
              <strong className="text-ink">{ing.unit}</strong>
            </span>
            <span>
              {t("history.category")}:{" "}
              <strong className="text-ink">{ing.category || "—"}</strong>
            </span>
            <span>
              {t("history.avgPrice")}:{" "}
              <strong className="text-ink">
                {money(ing.avgCost, numberLocale)}
              </strong>
            </span>
            <span>
              {t("history.stock")}:{" "}
              <strong className="text-ink">
                {qty(ing.stock, numberLocale)}
              </strong>
            </span>
            <span>
              {t("history.lastPurchase")}:{" "}
              <strong className="text-ink">
                {ing.lastPurchaseDate ?? "—"}
              </strong>
            </span>
          </div>
          <DataTable
            rows={data.movements}
            rowKey={(r, i) => `${r.date}-${r.type}-${r.qty}-${i}`}
            defaultSortKey="date"
            defaultSortDir="desc"
            emptyText={t("history.empty")}
            columns={[
              {
                key: "date",
                label: t("common.date"),
                sortValue: (r) => r.date,
                filterValue: (r) => r.date,
                render: (r) => r.date,
              },
              {
                key: "type",
                label: t("common.type"),
                title: t("history.typeTitle"),
                sortValue: (r) => r.type,
                filterValue: (r) => movementLabel(locale, r.type),
                render: (r) => movementLabel(locale, r.type),
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
                title: t("history.unitPrice"),
                align: "right",
                sortValue: (r) => r.unitPrice,
                filterValue: (r) => String(r.unitPrice),
                render: (r) => money(r.unitPrice, numberLocale),
              },
              {
                key: "total",
                label: t("common.total"),
                align: "right",
                sortValue: (r) => r.total,
                filterValue: (r) => String(r.total),
                render: (r) => money(r.total, numberLocale),
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
        </>
      ) : null}
    </Modal>
  );
}
