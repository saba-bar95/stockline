import { useEffect, useMemo, useState } from "react";
import { DataTable, type Column } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { LoadingState, PageHeader, Surface } from "../components/ui";
import { api, money, qty } from "../lib/api";
import { cn } from "../lib/cn";
import { usePrefs } from "../preferences/PreferencesContext";

type Block = {
  revenue: number;
  cogs: number;
  gross: number;
  writeOffCost: number;
  ohTotal: number;
  allocated: number;
  unallocated: number;
  net: number;
};

const EMPTY_BLOCK: Block = {
  revenue: 0,
  cogs: 0,
  gross: 0,
  writeOffCost: 0,
  ohTotal: 0,
  allocated: 0,
  unallocated: 0,
  net: 0,
};

type Pl = { day: Block; week: Block; month: Block; lastMonth?: Block };

function normalizePl(raw: Pl): Pl & { lastMonth: Block } {
  return {
    day: raw.day ?? EMPTY_BLOCK,
    week: raw.week ?? EMPTY_BLOCK,
    month: raw.month ?? EMPTY_BLOCK,
    lastMonth: raw.lastMonth ?? EMPTY_BLOCK,
  };
}

type PlPeriod = "day" | "week" | "month" | "lastMonth";

type PlDaySale = {
  id: number;
  itemName: string;
  source: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
  revenue: number;
  cogs: number;
};

type PlDayRow = {
  date: string;
  revenue: number;
  cogs: number;
  gross: number;
  writeOffCost: number;
  overhead: number;
  allocated: number;
  unallocated: number;
  net: number;
  hasProduction: boolean;
  sales: PlDaySale[];
};

type PlDetails = {
  from: string;
  to: string;
  summary: Block;
  daily: PlDayRow[];
};

function Card({
  title,
  block,
  delay,
  onOpen,
}: {
  title: string;
  block: Block | undefined;
  delay: number;
  onOpen: () => void;
}) {
  const { t, numberLocale } = usePrefs();
  const b = block ?? EMPTY_BLOCK;
  const positive = b.net >= 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "font-pl group relative w-full overflow-hidden rounded-2xl border border-line bg-linear-to-br from-panel to-teal-soft/40 p-5 text-left shadow-sm",
        "cursor-pointer transition-transform duration-300 ease-out hover:-translate-y-0.5 hover:shadow-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40",
      )}
      style={{
        animation: `surface-enter 0.45s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms both`,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-8 size-28 rounded-full bg-teal/10 blur-xl transition-opacity duration-300 group-hover:opacity-100"
      />
      <div className="relative text-[0.7rem] font-semibold tracking-[0.14em] text-teal-deep/85 uppercase">
        {title}
      </div>
      <div
        className={cn(
          "relative mt-2 text-[2.15rem] leading-none font-semibold tracking-tight tabular-nums",
          positive ? "text-teal-deep" : "text-danger",
        )}
      >
        {money(b.net, numberLocale)}
        <span className="ml-1 text-[0.55em] font-medium opacity-70">₾</span>
      </div>
      <p className="relative mt-2 text-sm text-ink-muted">{t("pl.netProfit")}</p>
      <div className="relative mt-4 space-y-1.5 border-t border-line pt-4 text-sm leading-relaxed text-ink-soft">
        <p className="flex items-baseline justify-between gap-3">
          <span>{t("pl.revenue")}</span>
          <span className="font-medium text-ink tabular-nums">
            {money(b.revenue, numberLocale)}
          </span>
        </p>
        <p className="flex items-baseline justify-between gap-3">
          <span>{t("pl.cogs")}</span>
          <span className="font-medium text-ink tabular-nums">
            {money(b.cogs, numberLocale)}
          </span>
        </p>
        <p className="flex items-baseline justify-between gap-3">
          <span>{t("pl.overhead")}</span>
          <span className="font-medium text-ink tabular-nums">
            {money(b.ohTotal, numberLocale)}
          </span>
        </p>
        <p className="flex items-baseline justify-between gap-3">
          <span>{t("pl.unallocated")}</span>
          <span className="font-medium text-ink tabular-nums">
            {money(b.unallocated, numberLocale)}
          </span>
        </p>
      </div>
    </button>
  );
}

function PlDetailModal({
  period,
  periodLabel,
  open,
  onClose,
}: {
  period: PlPeriod;
  periodLabel: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t, numberLocale } = usePrefs();
  const [detail, setDetail] = useState<PlDetails | null>(null);
  const [err, setErr] = useState("");
  const [selectedDay, setSelectedDay] = useState<PlDayRow | null>(null);

  useEffect(() => {
    if (!open) return;
    setDetail(null);
    setErr("");
    setSelectedDay(null);
    api<PlDetails>(`/pl/details?period=${period}`)
      .then(setDetail)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [open, period]);

  const s = detail?.summary;
  const activeDays =
    detail?.daily.filter(
      (d) =>
        d.revenue !== 0 ||
        d.cogs !== 0 ||
        d.writeOffCost !== 0 ||
        d.overhead !== 0 ||
        d.hasProduction,
    ) ?? [];

  const dailyColumns = useMemo((): Column<PlDayRow>[] => {
    const num = (n: number) => money(n, numberLocale);
    return [
      {
        key: "date",
        label: t("pl.colDate"),
        filterable: false,
        sortValue: (r) => r.date,
        render: (r) => (
          <span className="font-medium text-ink tabular-nums">{r.date}</span>
        ),
      },
      {
        key: "revenue",
        label: t("pl.revenue"),
        align: "right",
        filterable: false,
        sortValue: (r) => r.revenue,
        render: (r) => <span className="tabular-nums">{num(r.revenue)}</span>,
      },
      {
        key: "cogs",
        label: t("pl.cogs"),
        align: "right",
        filterable: false,
        sortValue: (r) => r.cogs,
        render: (r) => <span className="tabular-nums">{num(r.cogs)}</span>,
      },
      {
        key: "gross",
        label: t("pl.gross"),
        align: "right",
        filterable: false,
        sortValue: (r) => r.gross,
        render: (r) => <span className="tabular-nums">{num(r.gross)}</span>,
      },
      {
        key: "writeOffCost",
        label: t("pl.writeOffCost"),
        align: "right",
        filterable: false,
        sortValue: (r) => r.writeOffCost,
        render: (r) => (
          <span className="tabular-nums">{num(r.writeOffCost)}</span>
        ),
      },
      {
        key: "overhead",
        label: t("pl.overhead"),
        align: "right",
        filterable: false,
        sortValue: (r) => r.overhead,
        render: (r) => <span className="tabular-nums">{num(r.overhead)}</span>,
      },
      {
        key: "unallocated",
        label: t("pl.unallocated"),
        align: "right",
        filterable: false,
        sortValue: (r) => r.unallocated,
        render: (r) => (
          <span className="tabular-nums">{num(r.unallocated)}</span>
        ),
      },
      {
        key: "net",
        label: t("pl.netProfit"),
        align: "right",
        filterable: false,
        sortValue: (r) => r.net,
        render: (r) => (
          <span
            className={cn(
              "font-medium tabular-nums",
              r.net >= 0 ? "text-teal-deep" : "text-danger",
            )}
          >
            {num(r.net)}
          </span>
        ),
      },
    ];
  }, [t, numberLocale]);

  return (
    <>
      <Modal
        wide
        open={open}
        listenKeys={!selectedDay}
        onClose={onClose}
        title={t("pl.detailTitle", { period: periodLabel })}
      >
        {err ? (
          <div className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            {err}
          </div>
        ) : null}
        {!detail ? (
          <LoadingState label={t("common.loading")} />
        ) : (
          <div className="space-y-6">
            <p className="text-xs text-ink-muted tabular-nums">
              {detail.from} → {detail.to}
            </p>

            <div className="grid gap-2 rounded-xl border border-line bg-paper/60 p-4 text-sm sm:grid-cols-2">
              <Row label={t("pl.revenue")} value={money(s!.revenue, numberLocale)} />
              <Row label={t("pl.cogs")} value={money(s!.cogs, numberLocale)} />
              <Row label={t("pl.gross")} value={money(s!.gross, numberLocale)} />
              <Row
                label={t("pl.writeOffCost")}
                value={money(s!.writeOffCost, numberLocale)}
              />
              <Row label={t("pl.overhead")} value={money(s!.ohTotal, numberLocale)} />
              <Row
                label={t("pl.allocated")}
                value={money(s!.allocated, numberLocale)}
              />
              <Row
                label={t("pl.unallocated")}
                value={money(s!.unallocated, numberLocale)}
              />
              <Row
                label={t("pl.netProfit")}
                value={money(s!.net, numberLocale)}
                strong
                positive={s!.net >= 0}
              />
            </div>

            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-ink">{t("pl.sectionDaily")}</h4>
              <p className="text-xs text-ink-muted">{t("pl.clickDayForSales")}</p>
              <DataTable
                key={period}
                rows={activeDays}
                columns={dailyColumns}
                rowKey={(r) => r.date}
                defaultSortKey="date"
                defaultSortDir="asc"
                defaultPageSize={50}
                searchable={false}
                emptyText={t("pl.emptySection")}
                onRowClick={(row) => setSelectedDay(row)}
                rowClassName={(row) =>
                  row.sales.length > 0
                    ? "cursor-pointer hover:bg-teal-soft/30"
                    : "cursor-default"
                }
              />
            </section>
          </div>
        )}
      </Modal>

      {selectedDay ? (
        <PlDaySalesModal
          day={selectedDay}
          onBack={() => setSelectedDay(null)}
        />
      ) : null}
    </>
  );
}

function PlDaySalesModal({
  day,
  onBack,
}: {
  day: PlDayRow;
  onBack: () => void;
}) {
  const { t, numberLocale } = usePrefs();

  return (
    <Modal
      wide
      stacked
      open
      onBack={onBack}
      onClose={onBack}
      title={t("pl.daySalesTitle", { date: day.date })}
    >
      <div className="mb-4 grid gap-2 rounded-xl border border-line bg-paper/60 p-4 text-sm sm:grid-cols-2">
        <Row label={t("pl.revenue")} value={money(day.revenue, numberLocale)} />
        <Row label={t("pl.cogs")} value={money(day.cogs, numberLocale)} />
        <Row label={t("pl.gross")} value={money(day.gross, numberLocale)} />
        <Row
          label={t("pl.netProfit")}
          value={money(day.net, numberLocale)}
          strong
          positive={day.net >= 0}
        />
      </div>
      {day.sales.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("pl.emptySection")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-line bg-paper/80 text-left text-xs font-semibold tracking-wide text-ink-muted uppercase">
                <th className="px-3 py-2.5">{t("pl.colItem")}</th>
                <th className="px-3 py-2.5">{t("pl.colSource")}</th>
                <th className="px-3 py-2.5">{t("pl.colQty")}</th>
                <th className="px-3 py-2.5">{t("pl.colUnitPrice")}</th>
                <th className="px-3 py-2.5">{t("pl.colUnitCost")}</th>
                <th className="px-3 py-2.5">{t("pl.revenue")}</th>
                <th className="px-3 py-2.5">{t("pl.cogs")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/80">
              {day.sales.map((sale) => (
                <tr key={sale.id} className="text-ink-soft">
                  <td className="px-3 py-2">{sale.itemName}</td>
                  <td className="px-3 py-2">
                    {sale.source === "resale"
                      ? t("pl.sourceResale")
                      : t("pl.sourceManufactured")}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {qty(sale.qty, numberLocale)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {money(sale.unitPrice, numberLocale)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {money(sale.unitCost, numberLocale)}
                  </td>
                  <td className="px-3 py-2 font-medium text-ink tabular-nums">
                    {money(sale.revenue, numberLocale)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {money(sale.cogs, numberLocale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function Row({
  label,
  value,
  strong,
  positive,
}: {
  label: string;
  value: string;
  strong?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          strong &&
            (positive ? "font-semibold text-teal-deep" : "font-semibold text-danger"),
          !strong && "font-medium text-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function PlPage() {
  const t = usePrefs().t;
  const [data, setData] = useState<(Pl & { lastMonth: Block }) | null>(null);
  const [err, setErr] = useState("");
  const [detailPeriod, setDetailPeriod] = useState<PlPeriod | null>(null);

  useEffect(() => {
    api<Pl>("/pl")
      .then((raw) => setData(normalizePl(raw)))
      .catch((e) => setErr(e.message));
  }, []);

  const periodLabels: Record<PlPeriod, string> = {
    day: t("pl.today"),
    week: t("pl.week"),
    month: t("pl.month"),
    lastMonth: t("pl.lastMonth"),
  };

  return (
    <div className="font-pl">
      <PageHeader title={t("pl.title")} description={t("pl.detailHint")} />
      {err ? (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {err}
        </div>
      ) : null}
      <Surface>
        {!data ? (
          <LoadingState label={t("common.loading")} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card
              title={t("pl.today")}
              block={data.day}
              delay={40}
              onOpen={() => setDetailPeriod("day")}
            />
            <Card
              title={t("pl.week")}
              block={data.week}
              delay={100}
              onOpen={() => setDetailPeriod("week")}
            />
            <Card
              title={t("pl.month")}
              block={data.month}
              delay={160}
              onOpen={() => setDetailPeriod("month")}
            />
            <Card
              title={t("pl.lastMonth")}
              block={data.lastMonth}
              delay={220}
              onOpen={() => setDetailPeriod("lastMonth")}
            />
          </div>
        )}
      </Surface>
      {detailPeriod ? (
        <PlDetailModal
          period={detailPeriod}
          periodLabel={periodLabels[detailPeriod]}
          open={Boolean(detailPeriod)}
          onClose={() => setDetailPeriod(null)}
        />
      ) : null}
    </div>
  );
}
