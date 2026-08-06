import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MouseEvent, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, downloadExport, stripLocale } from "../lib/api";
import { cn } from "../lib/cn";
import type { Locale } from "../i18n";
import { usePrefs, type FontSize } from "../preferences/PreferencesContext";

const FONT_LABEL: Record<FontSize, string> = {
  sm: "A",
  md: "A",
  lg: "A",
};

type PanelPos = {
  bottom: number;
  left: number;
  width: number;
  maxHeight: number;
};

export function SettingsPanel() {
  const { t, locale, theme, setTheme, fontSize, cycleFontSize, qtyDecimals, bumpQtyDecimals } =
    usePrefs();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PanelPos>({
    bottom: 72,
    left: 16,
    width: 280,
    maxHeight: 520,
  });
  const [orgName, setOrgName] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportErr, setExportErr] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!open) return;
    api<{ orgName: string }>("/me")
      .then((m) => setOrgName(m.orgName || ""))
      .catch(() => {});
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;

    function place() {
      const r = triggerRef.current!.getBoundingClientRect();
      const width = Math.min(280, window.innerWidth - 16);
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      // Anchor above the trigger: distance from viewport bottom to trigger top, plus gap
      const bottom = Math.max(8, window.innerHeight - r.top + 8);
      const spaceAbove = r.top - 16;
      const maxHeight = Math.max(200, Math.min(420, spaceAbove));
      setPos({ bottom, left, width, maxHeight });
    }

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: Event) {
      const target = e.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      )
        return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function onThemeClick(next: "light" | "dark", e: MouseEvent) {
    setTheme(next, { x: e.clientX, y: e.clientY });
  }

  function onLocale(next: Locale) {
    if (next === locale) return;
    const rest = stripLocale(location.pathname);
    const path = rest === "/" ? `/${next}` : `/${next}${rest}`;
    // Prefer URL as source of truth — LocaleSync updates prefs once (avoids double setLocale)
    navigate(`${path}${location.search}${location.hash}`, { replace: true });
  }

  const panel = open
    ? createPortal(
        <div
          ref={panelRef}
          className="fixed z-110 overflow-auto rounded-xl border border-line bg-panel p-4 shadow-panel"
          style={{
            bottom: pos.bottom,
            left: pos.left,
            width: pos.width,
            maxHeight: pos.maxHeight,
            animation: "settings-in 0.2s cubic-bezier(0.22, 1, 0.36, 1) both",
          }}
          role="dialog"
          aria-label={t("settings.title")}
        >
          <p className="mb-3 font-display text-lg font-semibold tracking-tight text-gradient-heading">
            {t("settings.title")}
          </p>

          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
                {t("settings.language")}
              </legend>
              <div className="grid grid-cols-2 gap-1.5">
                <SegBtn active={locale === "ka"} onClick={() => onLocale("ka")}>
                  ქარ
                </SegBtn>
                <SegBtn active={locale === "en"} onClick={() => onLocale("en")}>
                  EN
                </SegBtn>
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
                {t("settings.theme")}
              </legend>
              <div className="grid grid-cols-2 gap-1.5">
                <SegBtn
                  active={theme === "light"}
                  onClick={(e) => onThemeClick("light", e)}
                >
                  {t("settings.themeLight")}
                </SegBtn>
                <SegBtn
                  active={theme === "dark"}
                  onClick={(e) => onThemeClick("dark", e)}
                >
                  {t("settings.themeDark")}
                </SegBtn>
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
                {t("settings.fontSize")}
              </legend>
              <button
                type="button"
                onClick={cycleFontSize}
                title={t("settings.fontSizeHint")}
                className={cn(
                  "btn-press flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-line-strong",
                  "bg-paper text-ink hover:border-teal hover:bg-teal-soft/50",
                )}
              >
                <span
                  className={cn(
                    "font-display font-semibold leading-none transition-[font-size] duration-200",
                    fontSize === "sm" && "text-base",
                    fontSize === "md" && "text-xl",
                    fontSize === "lg" && "text-2xl",
                  )}
                >
                  {FONT_LABEL[fontSize]}
                  <span className="relative -top-1 ml-0.5 text-[0.65em]">
                    +
                  </span>
                </span>
                <span className="text-sm text-ink-muted tabular-nums">
                  {fontSize === "sm" ? "S" : fontSize === "md" ? "M" : "L"}
                </span>
              </button>
              <p className="text-xs text-ink-muted">
                {t("settings.fontSizeHint")}
              </p>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
                {t("settings.qtyDecimals")}
              </legend>
              <div className="flex h-11 items-center gap-1.5">
                <button
                  type="button"
                  className="btn-press flex h-full w-11 cursor-pointer items-center justify-center rounded-lg border border-line-strong bg-paper text-lg text-ink hover:border-teal hover:bg-teal-soft/50 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={qtyDecimals <= 0}
                  onClick={() => bumpQtyDecimals(-1)}
                  aria-label={t("settings.qtyDecimalsLess")}
                >
                  −
                </button>
                <div className="flex h-full min-w-0 flex-1 items-center justify-center rounded-lg border border-line bg-paper tabular-nums text-ink">
                  <span className="font-medium">{qtyDecimals}</span>
                  <span className="ml-1 text-sm text-ink-muted">
                    {t("settings.qtyDecimalsUnit")}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-press flex h-full w-11 cursor-pointer items-center justify-center rounded-lg border border-line-strong bg-paper text-lg text-ink hover:border-teal hover:bg-teal-soft/50 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={qtyDecimals >= 4}
                  onClick={() => bumpQtyDecimals(1)}
                  aria-label={t("settings.qtyDecimalsMore")}
                >
                  +
                </button>
              </div>
              <p className="text-xs text-ink-muted">
                {t("settings.qtyDecimalsHint")}
              </p>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
                {t("settings.kitchenName")}
              </legend>
              <div className="flex gap-1.5">
                <input
                  className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 text-sm text-ink"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  maxLength={80}
                />
                <button
                  type="button"
                  className="btn-press h-9 shrink-0 cursor-pointer rounded-lg bg-teal px-2.5 text-xs font-medium text-white"
                  onClick={async () => {
                    if (!orgName.trim()) return;
                    await api("/me/org", {
                      method: "PATCH",
                      body: JSON.stringify({ name: orgName.trim() }),
                    });
                  }}
                >
                  {t("settings.saveName")}
                </button>
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
                {t("settings.export")}
              </legend>
              <p className="text-xs text-ink-muted">
                {t("settings.exportHint")}
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                <button
                  type="button"
                  disabled={exportBusy}
                  className="btn-press h-9 cursor-pointer rounded-lg border border-line bg-paper text-sm font-medium text-ink hover:border-teal disabled:opacity-50"
                  onClick={async () => {
                    setExportBusy(true);
                    setExportErr("");
                    try {
                      await downloadExport(
                        "/export/workbook.xlsx",
                        "stockline-export.xlsx",
                      );
                    } catch (e) {
                      setExportErr(
                        e instanceof Error ? e.message : "Export failed",
                      );
                    } finally {
                      setExportBusy(false);
                    }
                  }}
                >
                  {t("settings.exportExcel")}
                </button>
                <button
                  type="button"
                  disabled={exportBusy}
                  className="btn-press h-9 cursor-pointer rounded-lg border border-line bg-paper text-sm font-medium text-ink hover:border-teal disabled:opacity-50"
                  onClick={async () => {
                    setExportBusy(true);
                    setExportErr("");
                    try {
                      await downloadExport("/export/csv/pl", "stockline-pl.csv");
                    } catch (e) {
                      setExportErr(
                        e instanceof Error ? e.message : "Export failed",
                      );
                    } finally {
                      setExportBusy(false);
                    }
                  }}
                >
                  {t("settings.exportCsvPl")}
                </button>
              </div>
              {exportErr ? (
                <p className="text-xs text-red-600">{exportErr}</p>
              ) : null}
            </fieldset>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={t("settings.open")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "btn-press flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-[0.95rem] font-medium",
          open
            ? "bg-white/10 text-white"
            : "text-white/65 hover:bg-sidebar-hover hover:text-white",
        )}
      >
        <SettingsIcon className="size-[1.15rem] shrink-0 opacity-90" />
        <span>{t("settings.title")}</span>
      </button>
      {panel}
    </div>
  );
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "btn-press h-9 cursor-pointer rounded-lg text-sm font-medium",
        active
          ? "bg-teal text-white shadow-sm"
          : "border border-line bg-paper text-ink-soft hover:border-line-strong hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.86l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.86-.34 1.7 1.7 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.51 1.7 1.7 0 0 0-1.86.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.86 1.7 1.7 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.51-1 1.7 1.7 0 0 0-.34-1.86l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.86.34h.01A1.7 1.7 0 0 0 9 3.09V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.51 1.7 1.7 0 0 0 1.86-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.86v.01a1.7 1.7 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
    </svg>
  );
}
