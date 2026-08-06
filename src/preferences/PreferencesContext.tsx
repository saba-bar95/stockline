import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  createContext,
  type ReactNode,
} from "react";
import { numberLocale, translate, type Locale, type MessageKey } from "../i18n";
import { setQtyDecimalsLive } from "../lib/api";

export type Theme = "light" | "dark";
export type FontSize = "sm" | "md" | "lg";

const FONT_CYCLE: FontSize[] = ["sm", "md", "lg"];
const STORAGE_KEY = "stockline-prefs";
const LEGACY_STORAGE_KEYS = ["mise-prefs", "mza-prefs"] as const;
const QTY_DECIMALS_MIN = 0;
const QTY_DECIMALS_MAX = 4;

type Prefs = {
  locale: Locale;
  theme: Theme;
  fontSize: FontSize;
  qtyDecimals: number;
};

type PrefsContextValue = Prefs & {
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme, origin?: { x: number; y: number }) => void;
  toggleTheme: (origin?: { x: number; y: number }) => void;
  cycleFontSize: () => void;
  setFontSize: (size: FontSize) => void;
  setQtyDecimals: (n: number) => void;
  bumpQtyDecimals: (delta: number) => void;
  numberLocale: string;
};

const PrefsContext = createContext<PrefsContextValue | null>(null);

function clampQtyDecimals(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 2;
  return Math.min(QTY_DECIMALS_MAX, Math.max(QTY_DECIMALS_MIN, Math.round(v)));
}

function readStored(): Prefs {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      for (const key of LEGACY_STORAGE_KEYS) {
        raw = localStorage.getItem(key);
        if (raw) break;
      }
    }
    if (!raw)
      return { locale: "ka", theme: "light", fontSize: "md", qtyDecimals: 2 };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      locale: parsed.locale === "en" ? "en" : "ka",
      theme: parsed.theme === "dark" ? "dark" : "light",
      fontSize: FONT_CYCLE.includes(parsed.fontSize as FontSize)
        ? (parsed.fontSize as FontSize)
        : "md",
      qtyDecimals: clampQtyDecimals(parsed.qtyDecimals ?? 2),
    };
  } catch {
    return { locale: "ka", theme: "light", fontSize: "md", qtyDecimals: 2 };
  }
}

function applyDom(prefs: Pick<Prefs, "theme" | "fontSize" | "locale">) {
  const root = document.documentElement;
  root.dataset.theme = prefs.theme;
  root.dataset.fontSize = prefs.fontSize;
  root.lang = prefs.locale;
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(() => {
    const initial = readStored();
    applyDom(initial);
    setQtyDecimalsLive(initial.qtyDecimals);
    return initial;
  });

  useEffect(() => {
    applyDom(prefs);
    setQtyDecimalsLive(prefs.qtyDecimals);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }, [prefs]);

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) =>
      translate(prefs.locale, key, vars),
    [prefs.locale],
  );

  const setLocale = useCallback((locale: Locale) => {
    setPrefs((p) => {
      if (p.locale === locale) return p;
      document.documentElement.lang = locale;
      return { ...p, locale };
    });
  }, []);

  const setTheme = useCallback(
    (theme: Theme, origin?: { x: number; y: number }) => {
      const root = document.documentElement;
      if (origin) {
        root.style.setProperty("--theme-x", `${origin.x}px`);
        root.style.setProperty("--theme-y", `${origin.y}px`);
      } else {
        root.style.setProperty("--theme-x", `${window.innerWidth - 40}px`);
        root.style.setProperty("--theme-y", `${window.innerHeight - 40}px`);
      }

      // Apply theme on the DOM inside the transition so the wipe isn't waiting on React
      const apply = () => {
        root.dataset.theme = theme;
        setPrefs((p) => (p.theme === theme ? p : { ...p, theme }));
      };

      const doc = document as Document & {
        startViewTransition?: (cb: () => void) => { finished: Promise<void> };
      };
      if (typeof doc.startViewTransition === "function") {
        doc.startViewTransition(apply);
      } else {
        apply();
      }
    },
    [],
  );

  const toggleTheme = useCallback(
    (origin?: { x: number; y: number }) => {
      setTheme(prefs.theme === "light" ? "dark" : "light", origin);
    },
    [prefs.theme, setTheme],
  );

  const setFontSize = useCallback((fontSize: FontSize) => {
    document.documentElement.dataset.fontSize = fontSize;
    setPrefs((p) => ({ ...p, fontSize }));
  }, []);

  const cycleFontSize = useCallback(() => {
    setPrefs((p) => {
      const i = FONT_CYCLE.indexOf(p.fontSize);
      const next = FONT_CYCLE[(i + 1) % FONT_CYCLE.length];
      document.documentElement.dataset.fontSize = next;
      return { ...p, fontSize: next };
    });
  }, []);

  const setQtyDecimals = useCallback((n: number) => {
    const qtyDecimals = clampQtyDecimals(n);
    setQtyDecimalsLive(qtyDecimals);
    setPrefs((p) =>
      p.qtyDecimals === qtyDecimals ? p : { ...p, qtyDecimals },
    );
  }, []);

  const bumpQtyDecimals = useCallback((delta: number) => {
    setPrefs((p) => {
      const qtyDecimals = clampQtyDecimals(p.qtyDecimals + delta);
      setQtyDecimalsLive(qtyDecimals);
      if (p.qtyDecimals === qtyDecimals) return p;
      return { ...p, qtyDecimals };
    });
  }, []);

  const value = useMemo<PrefsContextValue>(
    () => ({
      ...prefs,
      t,
      setLocale,
      setTheme,
      toggleTheme,
      cycleFontSize,
      setFontSize,
      setQtyDecimals,
      bumpQtyDecimals,
      numberLocale: numberLocale(prefs.locale),
    }),
    [
      prefs,
      t,
      setLocale,
      setTheme,
      toggleTheme,
      cycleFontSize,
      setFontSize,
      setQtyDecimals,
      bumpQtyDecimals,
    ],
  );

  return (
    <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
  );
}

export function usePrefs() {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs must be used within PreferencesProvider");
  return ctx;
}

export function useT() {
  return usePrefs().t;
}
