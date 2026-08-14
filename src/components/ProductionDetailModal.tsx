import { useEffect, useState, type ReactNode } from "react";
import { api, formatApiError, money, qty } from "../lib/api";
import { unitLabel } from "../i18n";
import { usePrefs } from "../preferences/PreferencesContext";
import { DataTable } from "./DataTable";
import { Modal } from "./Modal";
import { LoadingState } from "./ui";

type MaterialLine = {
  ingredientId: string;
  name: string;
  unit: string;
  qty: number;
  unitCost: number;
  total: number;
};

type DetailPayload = {
  run: {
    id: number;
    date: string;
    productId: string;
    productName: string;
    productUnit: string;
    qty: number;
    unitCost: number;
    ingredientCost: number;
    overheadCost: number;
    fullCost: number;
  };
  materials: MaterialLine[];
};

type Props = {
  runId: number | null;
  onClose: () => void;
};

export function ProductionDetailModal({ runId, onClose }: Props) {
  const { t, locale, numberLocale, qtyDecimals } = usePrefs();
  const [data, setData] = useState<DetailPayload | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (runId == null) {
      setData(null);
      return;
    }
    setData(null);
    setErr("");
    api<DetailPayload>(`/production/${runId}`)
      .then(setData)
      .catch((e) => setErr(formatApiError(e, t)));
  }, [runId, t]);

  const run = data?.run;

  return (
    <Modal
      title={
        run
          ? t("production.detailTitleNamed", {
              name: run.productName,
              date: run.date,
            })
          : t("production.detailTitle")
      }
      open={runId != null}
      onClose={onClose}
      wide
    >
      {err ? <p className="mb-3 text-sm text-danger">{err}</p> : null}
      {!data && !err ? (
        <LoadingState label={t("common.loading")} className="py-10" />
      ) : null}
      {run && data ? (
        <>
          <div className="mb-5 grid grid-cols-2 gap-x-10 gap-y-4 rounded-xl bg-paper px-5 py-4 text-sm text-ink-soft sm:grid-cols-3">
            <Meta label="ID">
              <strong className="mono text-ink">{run.productId}</strong>
            </Meta>
            <Meta label={t("common.date")}>
              <strong className="text-ink">{run.date}</strong>
            </Meta>
            <Meta label={t("common.qty")}>
              <strong className="text-ink">
                {qty(run.qty, numberLocale, qtyDecimals)}
                {run.productUnit
                  ? ` ${unitLabel(locale, run.productUnit)}`
                  : ""}
              </strong>
            </Meta>
            <Meta label={t("production.unitCost")} title={t("production.unitCostFull")}>
              <strong className="text-ink">
                {money(run.unitCost, numberLocale)}
              </strong>
            </Meta>
            <Meta label={t("production.ingTotal")} title={t("production.ingTotalFull")}>
              <strong className="text-ink">
                {money(run.ingredientCost, numberLocale)}
              </strong>
            </Meta>
            <Meta label={t("production.overhead")} title={t("production.overheadFull")}>
              <strong className="text-ink">
                {money(run.overheadCost, numberLocale)}
              </strong>
            </Meta>
            <Meta label={t("production.fullCost")} title={t("production.fullCostFull")}>
              <strong className="text-ink">
                {money(run.fullCost, numberLocale)}
              </strong>
            </Meta>
          </div>
          <h2 className="mb-2 text-sm font-semibold text-ink">
            {t("production.materialsUsed")}
          </h2>
          <DataTable
            rows={data.materials}
            rowKey={(r) => r.ingredientId}
            defaultSortKey="name"
            emptyText={t("production.emptyMaterials")}
            scrollOnPageChange={false}
            columns={[
              {
                key: "ingredientId",
                label: "ID",
                sortValue: (r) => r.ingredientId,
                filterValue: (r) => r.ingredientId,
                render: (r) => <span className="mono">{r.ingredientId}</span>,
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
                render: (r) => unitLabel(locale, r.unit) || "—",
              },
              {
                key: "qty",
                label: t("common.qtyShort"),
                title: t("common.qty"),
                align: "right",
                sortValue: (r) => r.qty,
                filterValue: (r) => String(r.qty),
                render: (r) => qty(r.qty, numberLocale, qtyDecimals),
              },
              {
                key: "unitCost",
                label: t("common.price"),
                title: t("history.unitPrice"),
                align: "right",
                sortValue: (r) => r.unitCost,
                filterValue: (r) => String(r.unitCost),
                render: (r) => money(r.unitCost, numberLocale),
              },
              {
                key: "total",
                label: t("common.total"),
                align: "right",
                sortValue: (r) => r.total,
                filterValue: (r) => String(r.total),
                render: (r) => money(r.total, numberLocale),
              },
            ]}
          />
        </>
      ) : null}
    </Modal>
  );
}

function Meta({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1" title={title}>
      <div className="text-[0.7rem] font-semibold tracking-wide text-ink-muted uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}
