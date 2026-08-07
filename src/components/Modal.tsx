import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { useT } from "../preferences/PreferencesContext";
import { Button } from "./ui";

type Props = {
  title: string;
  open: boolean;
  onClose: () => void;
  onBack?: () => void;
  children: ReactNode;
  wide?: boolean;
  /** Raised layer for modals opened on top of another modal. */
  stacked?: boolean;
  /** When false, Escape / backdrop are ignored (e.g. hidden under a stacked modal). */
  listenKeys?: boolean;
};

export function Modal({
  title,
  open,
  onClose,
  onBack,
  children,
  wide,
  stacked = false,
  listenKeys = true,
}: Props) {
  const t = useT();
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open || !listenKeys) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (onBack) onBack();
        else onClose();
      }
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, listenKeys, onClose, onBack]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.scrollTo({ top: 0, left: 0 });
  }, [open, title]);

  if (!open) return null;

  const dismiss = onBack ?? onClose;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-[3px]",
        stacked ? "z-110" : "z-100",
      )}
      role="presentation"
      onClick={listenKeys ? dismiss : undefined}
      style={{ animation: "modal-backdrop 0.2s ease both" }}
    >
      <article
        ref={panelRef}
        className={cn(
          "max-h-[min(90vh,840px)] w-full overflow-auto rounded-2xl border border-line bg-panel p-5 shadow-2xl sm:p-6",
          wide ? "max-w-5xl" : "max-w-md",
        )}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          animation: "modal-panel 0.28s cubic-bezier(0.22, 1, 0.36, 1) both",
        }}
      >
        <header className="mb-5 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {onBack ? (
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={onBack}
                className="shrink-0 cursor-pointer px-2"
              >
                ← {t("common.back")}
              </Button>
            ) : null}
            <h3 className="font-display min-w-0 text-xl font-semibold tracking-tight text-gradient-heading">
              {title}
            </h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("common.close")}
            onClick={onClose}
            className="shrink-0 cursor-pointer px-2"
          >
            ✕
          </Button>
        </header>
        <div>{children}</div>
      </article>
    </div>,
    document.body,
  );
}
