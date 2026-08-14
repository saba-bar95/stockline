import { useEffect, useState } from "react";
import { api, formatApiError, money, qty } from "../lib/api";
import { movementLabel, unitLabel } from "../i18n";
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
  item: {
    id: string;
    name: string;
    unit: string;
    category: string;
    unitCost: number;
    stock: number;
    lastPurchaseDate: string | null;
  };
  movements: Movement[];
};

type Props = {
  resaleId: string | null;
  onClose: () => void;
};

export function ResaleHistoryModal({ resaleId, onClose }: Props) {
  const { t, locale, numberLocale } = usePrefs();
  const [data, setData] = useState<HistoryPayload | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!resaleId) {
      setData(null);
      return;
    }
    setData(null);
    setErr("");
    api<HistoryPayload>(`/resale/${resaleId}/history`)
      .then(setData)
      .catch((e) => setErr(formatApiError(e, t)));
  }, [resaleId, t]);

  const item = data?.item;

  return (
    <Modal
      title={
        item
          ? t("history.titleNamed", { name: item.name })
          : t("history.title")
      }
      open={!!resaleId}
      onClose={onClose}
      wide
    >
      {err ? <p className="mb-3 text-sm text-danger">{err}</p> : null}
      {!data && !err ? (
        <LoadingState label={t("common.loading")} className="py-10" />
      ) : null}
      {item && data ? (
        <>
          <div className="mb-5 grid grid-cols-2 gap-x-10 gap-y-4 rounded-xl bg-paper px-5 py-4 text-sm text-ink-soft sm:grid-cols-3">
            <div className="min-w-0 space-y-1">
              <div className="text-[0.7rem] font-semibold tracking-wide text-ink-muted uppercase">
                ID
              </div>
              <strong className="mono text-ink">{item.id}</strong>
            </div>
            <div className="min-w-0 space-y-1">
              <div className="text-[0.7rem] font-semibold tracking-wide text-ink-muted uppercase">
                {t("history.unit")}
              </div>
              <strong className="text-ink">
                {unitLabel(locale, item.unit)}
              </strong>
            </div>
            <div className="min-w-0 space-y-1">
              <div className="text-[0.7rem] font-semibold tracking-wide text-ink-muted uppercase">
                {t("history.category")}
              </div>
              <strong className="text-ink">{item.category || "—"}</strong>
            </div>
            <div className="min-w-0 space-y-1">
              <div className="text-[0.7rem] font-semibold tracking-wide text-ink-muted uppercase">
                {t("history.avgPrice")}
              </div>
              <strong className="text-ink">
                {money(item.unitCost, numberLocale)}
              </strong>
            </div>
            <div className="min-w-0 space-y-1">
              <div className="text-[0.7rem] font-semibold tracking-wide text-ink-muted uppercase">
                {t("history.stock")}
              </div>
              <strong className="text-ink">
                {qty(item.stock, numberLocale)}
              </strong>
            </div>
            <div className="min-w-0 space-y-1">
              <div className="text-[0.7rem] font-semibold tracking-wide text-ink-muted uppercase">
                {t("history.lastPurchase")}
              </div>
              <strong className="text-ink">
                {item.lastPurchaseDate ?? "—"}
              </strong>
            </div>
          </div>
          <DataTable
            rows={data.movements}
            rowKey={(r, i) => `${r.date}-${r.type}-${r.qty}-${i}`}
            defaultSortKey="date"
            defaultSortDir="desc"
            emptyText={t("history.empty")}
            scrollOnPageChange={false}
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
                title: t("history.typeTitleResale"),
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
