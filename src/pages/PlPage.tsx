import { useEffect, useState } from "react";
import { PageHeader, Surface } from "../components/ui";
import { api, money } from "../lib/api";
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

type Pl = { day: Block; week: Block; month: Block };

function Card({
  title,
  block,
  delay,
}: {
  title: string;
  block: Block;
  delay: number;
}) {
  const { t, numberLocale } = usePrefs();
  const positive = block.net >= 0;
  return (
    <div
      className={cn(
        "font-pl group relative overflow-hidden rounded-2xl border border-line bg-linear-to-br from-panel to-teal-soft/40 p-5 shadow-sm",
        "transition-transform duration-300 ease-out hover:-translate-y-0.5 hover:shadow-panel",
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
        {money(block.net, numberLocale)}
        <span className="ml-1 text-[0.55em] font-medium opacity-70">₾</span>
      </div>
      <p className="relative mt-2 text-sm text-ink-muted">
        {t("pl.netProfit")}
      </p>
      <div className="relative mt-4 space-y-1.5 border-t border-line pt-4 text-sm leading-relaxed text-ink-soft">
        <p className="flex items-baseline justify-between gap-3">
          <span>{t("pl.revenue")}</span>
          <span className="font-medium text-ink tabular-nums">
            {money(block.revenue, numberLocale)}
          </span>
        </p>
        <p className="flex items-baseline justify-between gap-3">
          <span>{t("pl.cogs")}</span>
          <span className="font-medium text-ink tabular-nums">
            {money(block.cogs, numberLocale)}
          </span>
        </p>
        <p className="flex items-baseline justify-between gap-3">
          <span>{t("pl.overhead")}</span>
          <span className="font-medium text-ink tabular-nums">
            {money(block.ohTotal, numberLocale)}
          </span>
        </p>
        <p className="flex items-baseline justify-between gap-3">
          <span>{t("pl.unallocated")}</span>
          <span className="font-medium text-ink tabular-nums">
            {money(block.unallocated, numberLocale)}
          </span>
        </p>
      </div>
    </div>
  );
}

export function PlPage() {
  const t = usePrefs().t;
  const [data, setData] = useState<Pl | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api<Pl>("/pl")
      .then(setData)
      .catch((e) => setErr(e.message));
  }, []);

  return (
    <div className="font-pl">
      <PageHeader title={t("pl.title")} description={t("pl.description")} />
      {err ? (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {err}
        </div>
      ) : null}
      <Surface>
        {!data ? (
          <p className="py-8 text-center text-ink-muted italic">
            {t("common.loading")}
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <Card title={t("pl.today")} block={data.day} delay={40} />
            <Card title={t("pl.week")} block={data.week} delay={100} />
            <Card title={t("pl.month")} block={data.month} delay={160} />
          </div>
        )}
      </Surface>
    </div>
  );
}
