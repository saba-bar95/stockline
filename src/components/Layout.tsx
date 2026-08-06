import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { AuthUserButton } from "../lib/auth";
import { localePath, NAV, stripLocale } from "../lib/api";
import { cn } from "../lib/cn";
import {
  CountsProvider,
  useCounts,
} from "../preferences/CountsContext";
import { usePrefs } from "../preferences/PreferencesContext";
import { SettingsPanel } from "./SettingsPanel";

export function Layout() {
  return (
    <CountsProvider>
      <LayoutShell />
    </CountsProvider>
  );
}

function LayoutShell() {
  const { t, locale } = usePrefs();
  const location = useLocation();
  const { counts, countsReady } = useCounts();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen">
      {menuOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 cursor-pointer bg-ink/50 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "z-50 flex h-dvh flex-col overflow-hidden border-white/10 bg-sidebar text-white",
          "fixed inset-y-0 left-0 w-[min(100%,280px)] max-w-[85vw] border-r border-white/5",
          "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          menuOpen ? "translate-x-0" : "-translate-x-full",
          "lg:w-[248px] lg:max-w-none lg:translate-x-0",
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-5">
          <div className="mb-6 shrink-0 px-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-[1.95rem] leading-none font-semibold tracking-tight">
                  <span className="bg-linear-to-r from-teal to-teal-deep bg-clip-text text-transparent uppercase">
                    MISE
                  </span>
                </p>
              </div>
              <button
                type="button"
                className="btn-press cursor-pointer rounded-lg p-2 text-white/70 hover:bg-sidebar-hover hover:text-white lg:hidden"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              >
                <CloseIcon className="size-5" />
              </button>
            </div>
            <div
              className="mt-4 h-px w-16 origin-left bg-linear-to-r from-teal to-transparent"
              style={{
                animation:
                  "accent-draw 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
              }}
            />
          </div>

          <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden overscroll-contain pr-0.5 [-ms-overflow-style:none] scrollbar-thin">
            {NAV.map((item) => {
              const n =
                item.countKey != null && countsReady
                  ? counts[item.countKey]
                  : undefined;
              const stagger =
                item.countKey == null
                  ? 0
                  : NAV.filter((x) => x.countKey).findIndex(
                      (x) => x.to === item.to,
                    );
              return (
                <NavLink
                  key={item.to}
                  to={localePath(locale, item.to)}
                  end={item.to === "/"}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "nav-item flex cursor-pointer items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2.5 text-[0.95rem] font-medium",
                      isActive
                        ? "bg-sidebar-active text-white shadow-sm"
                        : "text-white/70 hover:bg-sidebar-hover hover:text-white",
                    )
                  }
                >
                  <span className="min-w-0 truncate">{t(item.labelKey)}</span>
                  {n != null ? (
                    <span
                      className={cn(
                        "nav-count-badge inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5",
                        "text-[0.7rem] font-semibold tabular-nums",
                        "bg-white/12 text-white/85 ring-1 ring-white/15",
                      )}
                      style={{
                        animationDelay: `${Math.max(0, stagger) * 55}ms`,
                      }}
                    >
                      {n.toLocaleString()}
                    </span>
                  ) : null}
                </NavLink>
              );
            })}
          </nav>

          <div className="mt-3 shrink-0 space-y-1 border-t border-white/10 pt-3">
            <SettingsPanel />
            <SidebarAccount />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col lg:ml-[248px]">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line/80 bg-paper/85 px-4 py-3 backdrop-blur-md lg:hidden">
          <button
            type="button"
            className="btn-press cursor-pointer rounded-lg border border-line bg-panel p-2.5 text-ink shadow-sm"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <BurgerIcon className="size-5" />
          </button>
          <p className="font-display text-xl font-semibold tracking-tight">
            <span className="bg-linear-to-r from-teal-deep via-teal to-amber bg-clip-text text-transparent uppercase">
              MISE
            </span>
          </p>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div
            key={stripLocale(location.pathname)}
            className="page-enter mx-auto w-full max-w-350"
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarAccount() {
  const { t } = usePrefs();

  return (
    <div className="sidebar-account flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5">
      <div className="shrink-0">
        <AuthUserButton />
      </div>
      <span className="min-w-0 flex-1 truncate text-[0.95rem] font-medium text-white/70">
        {t("settings.account")}
      </span>
    </div>
  );
}

function BurgerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
