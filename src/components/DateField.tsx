import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/cn";
import { usePrefs } from "../preferences/PreferencesContext";

type Props = {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  id?: string;
  className?: string;
};

const WEEKDAYS_KA = ["ორშ", "სამ", "ოთხ", "ხუთ", "პარ", "შაბ", "კვი"];
const WEEKDAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function parseYmd(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d)
    return null;
  return dt;
}

function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Monday-first calendar cells for a month view. */
function buildCells(month: Date): Array<Date | null> {
  const first = startOfMonth(month);
  const startPad = (first.getDay() + 6) % 7; // Mon=0 … Sun=6
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function DateField({ value, onChange, required, id, className }: Props) {
  const { locale, t } = usePrefs();
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => parseYmd(value), [value]);
  const [view, setView] = useState(() => startOfMonth(selected ?? new Date()));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 300 });

  useEffect(() => {
    if (open) setView(startOfMonth(selected ?? new Date()));
  }, [open, selected]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    function place() {
      const r = triggerRef.current!.getBoundingClientRect();
      const width = Math.min(308, window.innerWidth - 16);
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      const panelH = 340;
      const below = r.bottom + 8;
      const top =
        below + panelH > window.innerHeight - 8
          ? Math.max(8, r.top - panelH - 8)
          : below;
      setPos({ top, left, width });
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

  const label = useMemo(() => {
    if (!selected) return t("common.pickDate");
    return selected.toLocaleDateString(locale === "ka" ? "ka-GE" : "en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, [selected, locale, t]);

  const weekdays = locale === "ka" ? WEEKDAYS_KA : WEEKDAYS_EN;
  const monthTitle = view.toLocaleDateString(
    locale === "ka" ? "ka-GE" : "en-GB",
    {
      month: "long",
      year: "numeric",
    },
  );
  const cells = useMemo(() => buildCells(view), [view]);
  const today = useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }, []);

  const panel = open
    ? createPortal(
        <div
          ref={panelRef}
          className="date-popover fixed z-[9999] overflow-hidden rounded-2xl border border-line bg-panel shadow-panel"
          style={{
            top: pos.top,
            left: pos.left,
            width: pos.width,
            animation: "settings-in 0.18s cubic-bezier(0.22, 1, 0.36, 1) both",
          }}
          role="dialog"
          aria-label={t("common.date")}
        >
          <div className="flex items-center justify-between gap-2 border-b border-line bg-gradient-to-br from-teal-soft/50 to-panel px-3 py-2.5">
            <button
              type="button"
              className="btn-press inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-ink-soft hover:bg-panel hover:text-ink"
              aria-label={t("common.prevMonth")}
              onClick={() => setView((v) => addMonths(v, -1))}
            >
              ‹
            </button>
            <p className="font-display text-base font-semibold tracking-tight text-ink capitalize">
              {monthTitle}
            </p>
            <button
              type="button"
              className="btn-press inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-ink-soft hover:bg-panel hover:text-ink"
              aria-label={t("common.nextMonth")}
              onClick={() => setView((v) => addMonths(v, 1))}
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 px-2.5 pt-2.5 text-center text-[0.7rem] font-semibold tracking-wide text-ink-muted uppercase">
            {weekdays.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5 px-2.5 pb-2.5">
            {cells.map((day, i) => {
              if (!day) return <div key={`e-${i}`} className="aspect-square" />;
              const isSelected = selected ? sameDay(day, selected) : false;
              const isToday = sameDay(day, today);
              return (
                <button
                  key={toYmd(day)}
                  type="button"
                  onClick={() => {
                    onChange(toYmd(day));
                    setOpen(false);
                  }}
                  className={cn(
                    "btn-press aspect-square cursor-pointer rounded-xl text-sm font-medium tabular-nums transition-colors",
                    isSelected
                      ? "bg-teal text-white shadow-sm"
                      : isToday
                        ? "bg-teal-soft text-teal-deep ring-1 ring-teal/30"
                        : "text-ink hover:bg-teal-soft/70",
                  )}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2.5">
            <button
              type="button"
              className="btn-press cursor-pointer rounded-lg px-2.5 py-1.5 text-sm font-medium text-teal-deep hover:bg-teal-soft"
              onClick={() => {
                const ymd = toYmd(today);
                onChange(ymd);
                setView(startOfMonth(today));
                setOpen(false);
              }}
            >
              {t("common.today")}
            </button>
            {!required ? (
              <button
                type="button"
                className="btn-press cursor-pointer rounded-lg px-2.5 py-1.5 text-sm text-ink-muted hover:bg-paper hover:text-ink"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                {t("common.clear")}
              </button>
            ) : null}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={cn("relative", className)}>
      {/* Keep a real input for form required/validation without showing the ugly native control */}
      <input
        id={id}
        type="text"
        tabIndex={-1}
        required={required}
        value={value}
        onChange={() => undefined}
        className="sr-only"
        aria-hidden
      />
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "date-field-trigger btn-press flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-panel px-3 text-left text-[0.95rem] text-ink shadow-sm",
          "transition-[border-color,box-shadow] duration-200",
          "hover:border-line-strong focus-visible:border-teal focus-visible:ring-2 focus-visible:ring-teal/20 focus-visible:outline-none",
          open && "border-teal ring-2 ring-teal/20",
        )}
      >
        <CalendarIcon className="size-[1.05rem] shrink-0 text-teal" />
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            !selected && "text-ink-muted",
          )}
        >
          {label}
        </span>
        <span className="text-ink-muted/80">{open ? "▴" : "▾"}</span>
      </button>
      {panel}
    </div>
  );
}

function CalendarIcon({ className }: { className?: string }) {
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
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
    </svg>
  );
}
