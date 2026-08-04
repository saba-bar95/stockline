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

export type Theme = "light" | "dark";
export type FontSize = "sm" | "md" | "lg";

const FONT_CYCLE: FontSize[] = ["sm", "md", "lg"];
const STORAGE_KEY = "mise-prefs";

type Prefs = {
  locale: Locale;
  theme: Theme;
  fontSize: FontSize;
};

type PrefsContextValue = Prefs & {
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme, origin?: { x: number; y: number }) => void;
  toggleTheme: (origin?: { x: number; y: number }) => void;
  cycleFontSize: () => void;
  setFontSize: (size: FontSize) => void;
  numberLocale: string;
};

const PrefsContext = createContext<PrefsContextValue | null>(null);

function readStored(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { locale: "ka", theme: "light", fontSize: "md" };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      locale: parsed.locale === "en" ? "en" : "ka",
      theme: parsed.theme === "dark" ? "dark" : "light",
      fontSize: FONT_CYCLE.includes(parsed.fontSize as FontSize)
        ? (parsed.fontSize as FontSize)
        : "md",
    };
  } catch {
    return { locale: "ka", theme: "light", fontSize: "md" };
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
    return initial;
  });

  useEffect(() => {
    applyDom(prefs);
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

  const value = useMemo<PrefsContextValue>(
    () => ({
      ...prefs,
      t,
      setLocale,
      setTheme,
      toggleTheme,
      cycleFontSize,
      setFontSize,
      numberLocale: numberLocale(prefs.locale),
    }),
    [prefs, t, setLocale, setTheme, toggleTheme, cycleFontSize, setFontSize],
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
