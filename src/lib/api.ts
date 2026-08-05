import type { MessageKey } from "../i18n";
import type { Locale } from "../i18n";

let getTokenFn: (() => Promise<string | null>) | null = null;

/** Wired from AuthProvider so api() can attach Clerk JWT. */
export function setApiTokenGetter(fn: () => Promise<string | null>) {
  getTokenFn = fn;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `/api${path}`;
  const maxAttempts = import.meta.env.DEV ? 8 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, init);
      const retryable =
        import.meta.env.DEV &&
        (res.status === 502 || res.status === 503 || res.status === 504);
      if (retryable && attempt < maxAttempts - 1) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      return res;
    } catch {
      if (import.meta.env.DEV && attempt < maxAttempts - 1) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      throw new Error("Cannot reach API — is the server running?");
    }
  }
  throw new Error("Cannot reach API — is the server running?");
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getTokenFn ? await getTokenFn() : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await apiFetch(path, {
    ...init,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || res.statusText);
  }
  return data as T;
}

/** Authenticated binary download (CSV / Excel). */
export async function downloadExport(path: string, filename: string) {
  const headers = new Headers();
  const token = getTokenFn ? await getTokenFn() : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await apiFetch(path, { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || res.statusText);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function money(n: number, locale = "en-US", decimals = 2) {
  const d = Math.min(6, Math.max(0, Math.round(decimals)));
  return n.toLocaleString(locale, {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

export function qty(n: number, locale = "en-US", decimals = getQtyDecimals()) {
  const d = Math.min(6, Math.max(0, Math.round(decimals)));
  return n.toLocaleString(locale, {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

/** Live qty decimal places — kept in sync by PreferencesProvider. */
let qtyDecimalsLive = 2;

export function getQtyDecimals() {
  return qtyDecimalsLive;
}

export function setQtyDecimalsLive(n: number) {
  qtyDecimalsLive = Math.min(6, Math.max(0, Math.round(n)));
}

export type NavItem = { to: string; labelKey: MessageKey };

export const NAV: NavItem[] = [
  { to: "/", labelKey: "nav.pl" },
  { to: "/ingredients", labelKey: "nav.ingredients" },
  { to: "/resale", labelKey: "nav.resale" },
  { to: "/products", labelKey: "nav.products" },
  { to: "/recipes", labelKey: "nav.recipes" },
  { to: "/purchases", labelKey: "nav.purchases" },
  { to: "/production", labelKey: "nav.production" },
  { to: "/sales", labelKey: "nav.sales" },
  { to: "/write-offs", labelKey: "nav.writeOffs" },
  { to: "/hr", labelKey: "nav.hr" },
  { to: "/expenses", labelKey: "nav.expenses" },
];

/** Build a locale-prefixed path: `/ka`, `/en/ingredients`, … */
export function localePath(locale: Locale, to: string): string {
  const rest = to === "/" ? "" : to.startsWith("/") ? to : `/${to}`;
  return `/${locale}${rest}`;
}

export function stripLocale(pathname: string): string {
  const m = pathname.match(/^\/(ka|en)(\/.*)?$/);
  if (!m) return pathname || "/";
  return m[2] || "/";
}

export function parseLocale(segment: string | undefined): Locale | null {
  return segment === "ka" || segment === "en" ? segment : null;
}
