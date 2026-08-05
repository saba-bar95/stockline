import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/cn";
import { usePrefs } from "../preferences/PreferencesContext";

export type SelectOption = {
  value: string;
  label: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  /** Allow typing a value that isn’t in the list (categories). */
  allowCustom?: boolean;
  searchable?: boolean;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
};

export function SelectField({
  value,
  onChange,
  options,
  placeholder,
  allowCustom = false,
  searchable = true,
  disabled = false,
  required = false,
  className,
  id,
  "aria-label": ariaLabel,
}: Props) {
  const { t } = usePrefs();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280 });

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  const display =
    selected?.label ||
    (allowCustom && value ? value : "") ||
    placeholder ||
    t("common.selectPlaceholder");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  const canCreate = useMemo(() => {
    if (!allowCustom) return false;
    const trimmed = query.trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    return !options.some(
      (o) =>
        o.value.toLowerCase() === lower || o.label.toLowerCase() === lower,
    );
  }, [allowCustom, options, query]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    function place() {
      const r = triggerRef.current!.getBoundingClientRect();
      const width = Math.max(r.width, 220);
      const left = Math.min(
        Math.max(8, r.left),
        window.innerWidth - width - 8,
      );
      const panelH = Math.min(320, 56 + filtered.length * 40 + (searchable ? 52 : 0));
      const below = r.bottom + 6;
      const top =
        below + panelH > window.innerHeight - 8
          ? Math.max(8, r.top - panelH - 6)
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
  }, [open, filtered.length, searchable]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const t = window.setTimeout(() => searchRef.current?.focus(), 20);
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
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  const panel = open
    ? createPortal(
        <div
          ref={panelRef}
          className="fixed z-9999 overflow-hidden rounded-2xl border border-line bg-panel shadow-panel"
          style={{
            top: pos.top,
            left: pos.left,
            width: pos.width,
            animation: "settings-in 0.16s cubic-bezier(0.22, 1, 0.36, 1) both",
          }}
          role="listbox"
        >
          {searchable ? (
            <div className="border-b border-line bg-linear-to-br from-teal-soft/40 to-panel p-2.5">
              <input
                ref={searchRef}
                type="search"
                className="ui-input h-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("common.selectSearch")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canCreate) {
                    e.preventDefault();
                    pick(query.trim());
                  } else if (e.key === "Enter" && filtered[0]) {
                    e.preventDefault();
                    pick(filtered[0].value);
                  }
                }}
              />
            </div>
          ) : null}

          <ul className="max-h-64 overflow-y-auto py-1.5">
            {filtered.map((o) => {
              const active = o.value === value;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={cn(
                      "btn-press flex w-full cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm transition-colors",
                      active
                        ? "bg-teal-soft/80 font-medium text-teal-deep"
                        : "text-ink hover:bg-teal-soft/50",
                    )}
                    onClick={() => pick(o.value)}
                  >
                    <span className="min-w-0 truncate">{o.label}</span>
                    {active ? (
                      <span className="shrink-0 text-teal" aria-hidden>
                        ✓
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
            {canCreate ? (
              <li>
                <button
                  type="button"
                  className="btn-press flex w-full cursor-pointer items-center gap-2 border-t border-line px-3.5 py-2.5 text-left text-sm font-medium text-teal-deep hover:bg-teal-soft/60"
                  onClick={() => pick(query.trim())}
                >
                  <span className="text-base leading-none">+</span>
                  <span>
                    {t("common.useValue", { value: query.trim() })}
                  </span>
                </button>
              </li>
            ) : null}
            {filtered.length === 0 && !canCreate ? (
              <li className="px-3.5 py-4 text-center text-sm text-ink-muted">
                {t("common.empty")}
              </li>
            ) : null}
          </ul>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      {required ? (
        <input
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          value={value}
          onChange={() => {}}
          required
        />
      ) : null}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          "ui-input flex h-10 w-full cursor-pointer items-center justify-between gap-2 text-left",
          !selected && !(allowCustom && value) && "text-ink-muted",
          open && "border-teal ring-2 ring-teal/20",
          disabled && "cursor-not-allowed opacity-45",
          className,
        )}
      >
        <span className="min-w-0 truncate">{display}</span>
        <span
          className={cn(
            "shrink-0 text-ink-muted transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        >
          ▾
        </span>
      </button>
      {panel}
    </>
  );
}
