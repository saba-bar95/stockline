import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MessageKey } from "../i18n";
import { usePrefs } from "../preferences/PreferencesContext";
import { cn } from "../lib/cn";
import { Modal } from "./Modal";

const SECTIONS = [
  { id: "flow", title: "guide.secFlow" },
  { id: "pages", title: "guide.secPages" },
  { id: "edit", title: "guide.secEdit" },
  { id: "costs", title: "guide.secCosts" },
  { id: "pl", title: "guide.secPl" },
  { id: "rules", title: "guide.secRules" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const PAGE_ROWS: Array<{ name: MessageKey; body: MessageKey }> = [
  { name: "nav.pl", body: "guide.pagePl" },
  { name: "nav.ingredients", body: "guide.pageIngredients" },
  { name: "nav.resale", body: "guide.pageResale" },
  { name: "nav.products", body: "guide.pageProducts" },
  { name: "nav.recipes", body: "guide.pageRecipes" },
  { name: "nav.purchases", body: "guide.pagePurchases" },
  { name: "nav.production", body: "guide.pageProduction" },
  { name: "nav.sales", body: "guide.pageSales" },
  { name: "nav.writeOffs", body: "guide.pageWriteOffs" },
  { name: "nav.hr", body: "guide.pageHr" },
  { name: "nav.expenses", body: "guide.pageExpenses" },
];

const PROSE: Record<Exclude<SectionId, "pages">, MessageKey[]> = {
  flow: ["guide.flow1", "guide.flow2", "guide.flow3", "guide.flow4"],
  edit: [
    "guide.edit1",
    "guide.edit2",
    "guide.edit3",
    "guide.edit4",
    "guide.edit5",
  ],
  costs: [
    "guide.costs1",
    "guide.costs2",
    "guide.costs3",
    "guide.costs4",
    "guide.costs5",
    "guide.costs6",
  ],
  pl: ["guide.pl1", "guide.pl2", "guide.pl3", "guide.pl4", "guide.pl5"],
  rules: [
    "guide.rules1",
    "guide.rules2",
    "guide.rules3",
    "guide.rules4",
    "guide.rules5",
  ],
};

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h4 className="font-display text-[1.35rem] font-semibold tracking-tight text-ink">
      {children}
    </h4>
  );
}

function ProseList({
  keys,
  t,
}: {
  keys: MessageKey[];
  t: (k: MessageKey) => string;
}) {
  return (
    <div className="space-y-3.5">
      {keys.map((key) => (
        <p key={key} className="text-[0.95rem] leading-relaxed text-ink-soft">
          {t(key)}
        </p>
      ))}
    </div>
  );
}

export function HowItWorksModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = usePrefs();
  const [section, setSection] = useState<SectionId>("flow");
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setSection("flow");
  }, [open]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, left: 0 });
  }, [section]);

  const sectionTitle = SECTIONS.find((s) => s.id === section)?.title;

  return (
    <Modal title={t("guide.title")} open={open} onClose={onClose} wide scrollBody>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
        <nav
          className="shrink-0 border-b border-line bg-paper/70 px-3 py-3 lg:w-52 lg:overflow-hidden lg:border-r lg:border-b-0 lg:px-3 lg:py-4"
          aria-label={t("guide.title")}
        >
          <p className="mb-2 hidden px-2 text-[0.65rem] font-semibold tracking-[0.14em] text-ink-muted uppercase lg:block">
            {t("guide.toc")}
          </p>
          <div className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0 [&::-webkit-scrollbar]:hidden">
            {SECTIONS.map((s) => {
              const active = section === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSection(s.id)}
                  className={cn(
                    "btn-press cursor-pointer rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                    "max-w-[14rem] shrink-0 whitespace-normal break-words lg:max-w-none lg:w-full lg:shrink",
                    active
                      ? "bg-teal text-white shadow-sm"
                      : "text-ink-soft hover:bg-teal-soft/50 hover:text-ink",
                  )}
                >
                  {t(s.title)}
                </button>
              );
            })}
          </div>
        </nav>

        <div
          ref={contentRef}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6"
          key={section}
          style={{ animation: "guide-section-in 0.22s ease both" }}
        >
          <div className="mx-auto max-w-2xl space-y-5">
            {sectionTitle ? (
              <SectionHeading>{t(sectionTitle)}</SectionHeading>
            ) : null}

            {section === "pages" ? (
              <>
                <p className="text-[0.95rem] leading-relaxed text-ink-soft">
                  {t("guide.pagesIntro")}
                </p>
                <dl className="overflow-hidden rounded-xl border border-line bg-paper/40">
                  {PAGE_ROWS.map((row) => (
                    <div
                      key={row.name}
                      className="grid gap-1 border-b border-line px-3.5 py-3 last:border-b-0 sm:grid-cols-[10rem_1fr] sm:gap-4 sm:px-4"
                    >
                      <dt className="text-sm font-semibold text-ink">
                        {t(row.name)}
                      </dt>
                      <dd className="text-[0.92rem] leading-relaxed text-ink-soft">
                        {t(row.body)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : null}

            {section === "pl" ? (
              <>
                <div className="rounded-xl border border-teal/25 bg-teal-soft/40 px-4 py-3.5">
                  <p className="text-[0.7rem] font-semibold tracking-[0.12em] text-teal-deep uppercase">
                    {t("guide.formulaLabel")}
                  </p>
                  <p className="mt-1.5 font-mono text-[0.92rem] leading-snug text-ink sm:text-[0.98rem]">
                    {t("guide.pl1")}
                  </p>
                </div>
                <ProseList keys={PROSE.pl.slice(1)} t={t} />
              </>
            ) : null}

            {section !== "pages" && section !== "pl" ? (
              <ProseList keys={PROSE[section]} t={t} />
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}
