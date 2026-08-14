import type { MessageKey } from "../i18n";
import type { Locale } from "../i18n";

let getTokenFn: (() => Promise<string | null>) | null = null;
let busyDeltaFn: ((delta: number) => void) | null = null;

/** Wired from AuthProvider so api() can attach Clerk JWT. */
export function setApiTokenGetter(fn: () => Promise<string | null>) {
  getTokenFn = fn;
}

/** Wired from BusyOverlayProvider — tracks in-flight mutations. */
export function setApiBusyListener(fn: ((delta: number) => void) | null) {
  busyDeltaFn = fn;
}

function trackMutationBusy(method: string | undefined, delta: number) {
  const m = (method ?? "GET").toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return;
  busyDeltaFn?.(delta);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** GETs are reused across page navigations until a mutation or TTL. */
const GET_CACHE_TTL_MS = 2 * 60 * 1000;
let cacheGen = 0;
const getCache = new Map<string, { data: unknown; at: number }>();
const inflightGets = new Map<string, Promise<unknown>>();
const invalidateListeners = new Set<() => void>();

export function invalidateApiCache() {
  cacheGen += 1;
  getCache.clear();
  inflightGets.clear();
  for (const fn of [...invalidateListeners]) fn();
}

export function subscribeApiCacheInvalidate(listener: () => void) {
  invalidateListeners.add(listener);
  return () => {
    invalidateListeners.delete(listener);
  };
}

function isGet(method: string | undefined) {
  return (method ?? "GET").toUpperCase() === "GET";
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

export class ApiError extends Error {
  code?: string;
  conflictDate?: string;
  conflictKind?: string;
  stock?: string;
  need?: string;
  have?: string;
  itemId?: string;
  constructor(
    message: string,
    details?: {
      code?: string;
      conflictDate?: string;
      conflictKind?: string;
      stock?: string;
      need?: string;
      have?: string;
      itemId?: string;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.code = details?.code;
    this.conflictDate = details?.conflictDate;
    this.conflictKind = details?.conflictKind;
    this.stock = details?.stock;
    this.need = details?.need;
    this.have = details?.have;
    this.itemId = details?.itemId;
  }
}

export function formatApiError(
  e: unknown,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): string {
  if (e instanceof ApiError) {
    if (e.code === "purchase_timeline") {
      const kindLabel =
        e.conflictKind === "production"
          ? t("purchases.conflictProduction")
          : e.conflictKind === "sale"
            ? t("purchases.conflictSale")
            : t("purchases.conflictWriteOff");
      return t("purchases.timelineConflict", {
        date: e.conflictDate ?? "—",
        kind: kindLabel,
      });
    }
    if (e.code === "recipe_in_use") {
      return t("recipes.deleteBlocked");
    }
    if (e.code === "recipe_duplicate") {
      return t("recipes.duplicateBlocked");
    }
    if (e.code === "not_found") return t("errors.notFound");
    if (e.code === "no_recipe") return t("errors.noRecipe");
    if (e.code === "invalid_unit") return t("errors.invalidUnit");
    if (e.code === "invalid_id") return t("errors.invalidId");
    if (e.code === "invalid_request") return t("errors.invalidRequest");
    if (e.code === "invalid_query") return t("errors.invalidQuery");
    if (e.code === "invalid_product_or_ingredient") {
      return t("errors.invalidProductOrIngredient");
    }
    if (e.code === "employee_not_found") return t("errors.employeeNotFound");
    if (e.code === "employee_inactive") return t("errors.employeeInactive");
    if (e.code === "failed_production") return t("errors.failedProduction");
    if (e.code === "too_many_requests") return t("errors.tooManyRequests");
    if (e.code === "unknown_export") return t("errors.unknownExport");
    if (e.code === "unauthorized") return t("errors.unauthorized");
    if (e.code === "server_error") return t("errors.serverError");
    if (e.code === "category_required") return t("ingredients.categoryRequired");
    if (e.code === "ingredient_in_use") return t("ingredients.deleteBlocked");
    if (e.code === "product_in_use") return t("products.deleteBlocked");
    if (e.code === "resale_in_use") return t("resale.deleteBlocked");
    if (e.code === "insufficient_stock") {
      return t("errors.insufficientStock", { stock: e.stock ?? "—" });
    }
    if (e.code === "insufficient_stock_need") {
      return t("errors.insufficientStockNeed", {
        itemId: e.itemId ?? "—",
        need: e.need ?? "—",
        have: e.have ?? "—",
      });
    }
    const translated = translateLegacyApiMessage(e.message, t);
    if (translated) return translated;
  }
  if (e instanceof Error) {
    return translateLegacyApiMessage(e.message, t) ?? e.message;
  }
  return t("common.error");
}

function translateLegacyApiMessage(
  msg: string,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): string | null {
  const stockOnly =
    msg.match(/არასაკმარისი ნაშთი \(არის (.+)\)/) ||
    msg.match(/Insufficient stock \(available (.+)\)/i);
  if (stockOnly) {
    return t("errors.insufficientStock", { stock: stockOnly[1] });
  }
  const needHave =
    msg.match(/არასაკმარისი ნაშთი: (.+) \(სჭირდება (.+), არის (.+)\)/) ||
    msg.match(/Insufficient stock: (.+) \(need (.+), available (.+)\)/i);
  if (needHave) {
    return t("errors.insufficientStockNeed", {
      itemId: needHave[1],
      need: needHave[2],
      have: needHave[3],
    });
  }
  if (msg === "არ მოიძებნა" || msg === "not_found") return t("errors.notFound");
  if (msg.includes("შემადგენლობა არ არის") || msg === "no_recipe") {
    return t("errors.noRecipe");
  }
  if (msg.startsWith("წაშლა შეუძლებელია") || msg.startsWith("Cannot delete")) {
    if (msg.includes("ინგრედიენტ") || msg.includes("material")) {
      return t("ingredients.deleteBlocked");
    }
    if (msg.includes("შესყიდვა, გაყიდვა") || msg.includes("merchandise")) {
      return t("resale.deleteBlocked");
    }
    return t("products.deleteBlocked");
  }
  if (msg === "Invalid unit" || msg === "invalid_unit") {
    return t("errors.invalidUnit");
  }
  if (msg === "Category is required" || msg === "category_required") {
    return t("ingredients.categoryRequired");
  }
  if (msg === "Invalid id" || msg === "invalid_id") return t("errors.invalidId");
  if (msg === "Invalid request" || msg === "invalid_request") {
    return t("errors.invalidRequest");
  }
  if (msg === "Invalid query" || msg === "invalid_query") {
    return t("errors.invalidQuery");
  }
  if (
    msg === "Invalid product or ingredient" ||
    msg === "invalid_product_or_ingredient"
  ) {
    return t("errors.invalidProductOrIngredient");
  }
  if (msg === "Employee not found" || msg === "employee_not_found") {
    return t("errors.employeeNotFound");
  }
  if (msg === "employee_inactive") {
    return t("errors.employeeInactive");
  }
  if (msg === "Failed to record production" || msg === "failed_production") {
    return t("errors.failedProduction");
  }
  if (msg === "Too many requests" || msg === "too_many_requests") {
    return t("errors.tooManyRequests");
  }
  if (msg === "payload_too_large") {
    return t("errors.payloadTooLarge");
  }
  if (msg === "timeout") {
    return t("errors.timeout");
  }
  if (msg === "misconfigured") {
    return t("errors.misconfigured");
  }
  if (msg === "Unknown export entity" || msg === "unknown_export") {
    return t("errors.unknownExport");
  }
  if (msg === "Unauthorized" || msg === "unauthorized") {
    return t("errors.unauthorized");
  }
  if (msg === "Something went wrong" || msg === "server_error") {
    return t("errors.serverError");
  }
  if (msg.startsWith("Cannot reach API")) return t("errors.cannotReach");
  if (msg === "Export failed") return t("errors.exportFailed");
  return null;
}

async function parseApiResponse<T>(res: Response): Promise<T> {
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
      conflictDate?: string;
      conflictKind?: string;
      stock?: string;
      need?: string;
      have?: string;
      itemId?: string;
    };
    if (!res.ok) {
      throw new ApiError(data.error || res.statusText, {
        code: data.code ?? data.error,
        conflictDate: data.conflictDate,
        conflictKind: data.conflictKind,
        stock: data.stock,
        need: data.need,
        have: data.have,
        itemId: data.itemId,
      });
    }
  return data as T;
}

async function sendApi<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getTokenFn ? await getTokenFn() : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await apiFetch(path, { ...init, headers });
  return parseApiResponse<T>(res);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (isGet(init?.method)) {
    const cached = getCache.get(path);
    if (cached && Date.now() - cached.at < GET_CACHE_TTL_MS) {
      return cached.data as T;
    }
    const pending = inflightGets.get(path);
    if (pending) return pending as Promise<T>;

    const gen = cacheGen;
    const request = sendApi<T>(path, init)
      .then((data) => {
        if (gen === cacheGen) {
          getCache.set(path, { data, at: Date.now() });
        }
        return data;
      })
      .finally(() => {
        if (inflightGets.get(path) === request) inflightGets.delete(path);
      });
    inflightGets.set(path, request);
    return request;
  }

  trackMutationBusy(init?.method, 1);
  try {
    const data = await sendApi<T>(path, init);
    invalidateApiCache();
    return data;
  } finally {
    trackMutationBusy(init?.method, -1);
  }
}

/** Authenticated binary download (CSV / Excel). */
export async function downloadExport(path: string, filename: string) {
  const headers = new Headers();
  const token = getTokenFn ? await getTokenFn() : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await apiFetch(path, { headers });
  if (!res.ok) {
    await parseApiResponse(res);
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

export type NavItem = {
  to: string;
  labelKey: MessageKey;
  /** Key in GET /counts — omit for P&L. */
  countKey?: keyof NavCounts;
};

export type NavCounts = {
  ingredients: number;
  resale: number;
  products: number;
  recipes: number;
  purchases: number;
  production: number;
  sales: number;
  writeOffs: number;
  hr: number;
  expenses: number;
};

export const NAV: NavItem[] = [
  { to: "/", labelKey: "nav.pl" },
  { to: "/ingredients", labelKey: "nav.ingredients", countKey: "ingredients" },
  { to: "/resale", labelKey: "nav.resale", countKey: "resale" },
  { to: "/products", labelKey: "nav.products", countKey: "products" },
  { to: "/recipes", labelKey: "nav.recipes", countKey: "recipes" },
  { to: "/purchases", labelKey: "nav.purchases", countKey: "purchases" },
  { to: "/production", labelKey: "nav.production", countKey: "production" },
  { to: "/sales", labelKey: "nav.sales", countKey: "sales" },
  { to: "/write-offs", labelKey: "nav.writeOffs", countKey: "writeOffs" },
  { to: "/hr", labelKey: "nav.hr", countKey: "hr" },
  { to: "/expenses", labelKey: "nav.expenses", countKey: "expenses" },
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
