import { useEffect, useState } from "react";
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

export function HowItWorksModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = usePrefs();
  const [section, setSection] = useState<SectionId>("flow");

  useEffect(() => {
    if (open) setSection("flow");
  }, [open]);

  return (
    <Modal
      title={t("guide.title")}
      open={open}
      onClose={onClose}
      wide
      scrollBody
      scrollResetKey={section}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:gap-8">
        <nav
          className="sticky top-0 z-10 flex shrink-0 gap-1 overflow-x-auto bg-panel pb-2 lg:w-48 lg:flex-col lg:overflow-visible lg:pb-0"
          aria-label={t("guide.title")}
        >
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={cn(
                "btn-press shrink-0 cursor-pointer rounded-lg px-3 py-2 text-left text-sm font-medium",
                section === s.id
                  ? "bg-teal text-white shadow-sm"
                  : "text-ink-soft hover:bg-teal-soft/60 hover:text-ink",
              )}
            >
              {t(s.title)}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-4 text-[0.95rem] leading-relaxed text-ink-soft">
          {section === "flow" ? (
            <>
              <h4 className="font-display text-lg font-semibold text-ink">
                {t("guide.secFlow")}
              </h4>
              <p>{t("guide.flow1")}</p>
              <p>{t("guide.flow2")}</p>
              <p>{t("guide.flow3")}</p>
              <p>{t("guide.flow4")}</p>
            </>
          ) : null}

          {section === "pages" ? (
            <>
              <h4 className="font-display text-lg font-semibold text-ink">
                {t("guide.secPages")}
              </h4>
              <p>{t("guide.pagesIntro")}</p>
              <dl className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                {PAGE_ROWS.map((row) => (
                  <div
                    key={row.name}
                    className="grid gap-1 px-3.5 py-3 sm:grid-cols-[9.5rem_1fr] sm:gap-4"
                  >
                    <dt className="text-sm font-semibold text-ink">
                      {t(row.name)}
                    </dt>
                    <dd>{t(row.body)}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}

          {section === "edit" ? (
            <>
              <h4 className="font-display text-lg font-semibold text-ink">
                {t("guide.secEdit")}
              </h4>
              <p>{t("guide.edit1")}</p>
              <p>{t("guide.edit2")}</p>
              <p>{t("guide.edit3")}</p>
              <p>{t("guide.edit4")}</p>
              <p>{t("guide.edit5")}</p>
            </>
          ) : null}

          {section === "costs" ? (
            <>
              <h4 className="font-display text-lg font-semibold text-ink">
                {t("guide.secCosts")}
              </h4>
              <p>{t("guide.costs1")}</p>
              <p>{t("guide.costs2")}</p>
              <p>{t("guide.costs3")}</p>
              <p>{t("guide.costs4")}</p>
              <p>{t("guide.costs5")}</p>
              <p>{t("guide.costs6")}</p>
            </>
          ) : null}

          {section === "pl" ? (
            <>
              <h4 className="font-display text-lg font-semibold text-ink">
                {t("guide.secPl")}
              </h4>
              <p>{t("guide.pl1")}</p>
              <p>{t("guide.pl2")}</p>
              <p>{t("guide.pl3")}</p>
              <p>{t("guide.pl4")}</p>
              <p>{t("guide.pl5")}</p>
            </>
          ) : null}

          {section === "rules" ? (
            <>
              <h4 className="font-display text-lg font-semibold text-ink">
                {t("guide.secRules")}
              </h4>
              <p>{t("guide.rules1")}</p>
              <p>{t("guide.rules2")}</p>
              <p>{t("guide.rules3")}</p>
              <p>{t("guide.rules4")}</p>
              <p>{t("guide.rules5")}</p>
            </>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
