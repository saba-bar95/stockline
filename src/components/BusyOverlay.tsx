import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { setApiBusyListener } from "../lib/api";
import { useT } from "../preferences/PreferencesContext";
import { Spinner } from "./ui";

export function BusyOverlayProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    setApiBusyListener((delta) => {
      setPending((n) => Math.max(0, n + delta));
    });
    return () => setApiBusyListener(null);
  }, []);

  useEffect(() => {
    if (pending <= 0) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const block = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    // Capture phase so Escape / shortcuts cannot dismiss modals mid-save.
    window.addEventListener("keydown", block, true);
    window.addEventListener("keyup", block, true);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", block, true);
      window.removeEventListener("keyup", block, true);
    };
  }, [pending]);

  return (
    <>
      {children}
      {pending > 0
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex cursor-wait items-center justify-center bg-ink/45 backdrop-blur-[2px]"
              role="alertdialog"
              aria-busy="true"
              aria-live="assertive"
              aria-label={t("common.saving")}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-panel px-8 py-7 shadow-2xl">
                <Spinner className="size-8 border-[3px]" />
                <p className="text-sm font-medium tracking-wide text-ink-soft">
                  {t("common.saving")}
                </p>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
