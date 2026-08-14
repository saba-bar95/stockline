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
  /** Keep the header fixed and scroll only the body. */
  scrollBody?: boolean;
  /** Raised layer for modals opened on top of another modal. */
  stacked?: boolean;
  /** When false, Escape / backdrop are ignored (e.g. hidden under a stacked modal). */
  listenKeys?: boolean;
  /** Change this to scroll the body back to the top (e.g. in-guide section switch). */
  scrollResetKey?: string | number;
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
  scrollResetKey,
}: Props) {
  const t = useT();
  const panelRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
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
    if (!open) return;
    const el = scrollBody ? bodyRef.current : panelRef.current;
    el?.scrollTo({ top: 0, left: 0 });
  }, [open, title, scrollBody, scrollResetKey]);

  if (!open) return null;

  const dismiss = onBack ?? onClose;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-[3px]",
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
            ? "flex max-h-[min(92vh,900px)] flex-col overflow-hidden p-5 sm:p-6"
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
        <header className="mb-5 flex shrink-0 items-start justify-between gap-3">
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
          ref={bodyRef}
          className={cn(scrollBody && "min-h-0 flex-1 overflow-auto pr-1")}
        >
          {children}
        </div>
      </article>
    </div>,
    document.body,
  );
}
