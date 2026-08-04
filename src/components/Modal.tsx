import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { useT } from "../preferences/PreferencesContext";
import { Button } from "./ui";

type Props = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
};

export function Modal({ title, open, onClose, children, wide }: Props) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-[3px]"
      role="presentation"
      onClick={onClose}
      style={{ animation: "modal-backdrop 0.2s ease both" }}
    >
      <article
        className={cn(
          "max-h-[min(90vh,840px)] w-full overflow-auto rounded-2xl border border-line bg-panel p-5 shadow-2xl sm:p-6",
          wide ? "max-w-4xl" : "max-w-md",
        )}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          animation: "modal-panel 0.28s cubic-bezier(0.22, 1, 0.36, 1) both",
        }}
      >
        <header className="mb-5 flex items-start justify-between gap-3">
          <h3 className="font-display text-xl font-semibold tracking-tight text-gradient-heading">
            {title}
          </h3>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("common.close")}
            onClick={onClose}
            className="cursor-pointer px-2"
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
