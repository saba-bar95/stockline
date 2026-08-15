import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { lockBodyScroll, unlockBodyScroll } from "../lib/bodyScrollLock";
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
  /**
   * Fixed panel height + flex body (children own scrolling).
   * Keeps the dialog centered when content length changes.
   */
  scrollBody?: boolean;
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
  scrollBody = false,
  stacked = false,
  listenKeys = true,
}: Props) {
  const t = useT();
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const onBackRef = useRef(onBack);
  onCloseRef.current = onClose;
  onBackRef.current = onBack;

  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [open]);

  useEffect(() => {
    if (!open || !listenKeys) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (onBackRef.current) onBackRef.current();
      else onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, listenKeys]);

  useEffect(() => {
    if (!open || scrollBody) return;
    panelRef.current?.scrollTo({ top: 0, left: 0 });
  }, [open, title, scrollBody]);

  if (!open) return null;

  const dismiss = onBack ?? onClose;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 flex items-center justify-center bg-ink/50 p-3 backdrop-blur-[3px] sm:p-4",
        stacked ? "z-130" : "z-120",
      )}
      role="presentation"
      onClick={listenKeys ? dismiss : undefined}
      style={{ animation: "modal-backdrop 0.2s ease both" }}
    >
      <article
        ref={panelRef}
        className={cn(
          "w-full rounded-2xl border border-line bg-panel shadow-2xl",
          scrollBody
            ? "flex h-[min(88vh,760px)] flex-col overflow-hidden p-0"
            : "max-h-[min(90vh,840px)] overflow-auto p-5 sm:p-6",
          wide ? "max-w-5xl" : "max-w-md",
        )}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          animation: "modal-panel 0.28s cubic-bezier(0.22, 1, 0.36, 1) both",
        }}
      >
        <header
          className={cn(
            "flex shrink-0 items-start justify-between gap-3",
            scrollBody ? "border-b border-line px-5 py-4 sm:px-6" : "mb-5",
          )}
        >
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
        <div
          className={cn(
            scrollBody && "flex min-h-0 flex-1 flex-col overflow-hidden",
          )}
        >
          {children}
        </div>
      </article>
    </div>,
    document.body,
  );
}
