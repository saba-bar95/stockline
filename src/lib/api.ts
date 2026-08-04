import type { MessageKey } from '../i18n'
import type { Locale } from '../i18n'

let getTokenFn: (() => Promise<string | null>) | null = null

/** Wired from AuthProvider so api() can attach Clerk JWT. */
export function setApiTokenGetter(fn: () => Promise<string | null>) {
  getTokenFn = fn
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getTokenFn ? await getTokenFn() : null
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`/api${path}`, {
    ...init,
    headers,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || res.statusText)
  }
  return data as T
}

/** Authenticated binary download (CSV / Excel). */
export async function downloadExport(path: string, filename: string) {
  const headers = new Headers()
  const token = getTokenFn ? await getTokenFn() : null
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`/api${path}`, { headers })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error || res.statusText)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function today() {
  return new Date().toISOString().slice(0, 10)
}

export function money(n: number, locale = 'en-US') {
  return n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function qty(n: number, locale = 'en-US') {
  return n.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 3 })
}

export type NavItem = { to: string; labelKey: MessageKey }

export const NAV: NavItem[] = [
  { to: '/', labelKey: 'nav.pl' },
  { to: '/ingredients', labelKey: 'nav.ingredients' },
  { to: '/resale', labelKey: 'nav.resale' },
  { to: '/products', labelKey: 'nav.products' },
  { to: '/recipes', labelKey: 'nav.recipes' },
  { to: '/purchases', labelKey: 'nav.purchases' },
  { to: '/production', labelKey: 'nav.production' },
  { to: '/sales', labelKey: 'nav.sales' },
  { to: '/write-offs', labelKey: 'nav.writeOffs' },
  { to: '/hr', labelKey: 'nav.hr' },
  { to: '/expenses', labelKey: 'nav.expenses' },
]

/** Build a locale-prefixed path: `/ka`, `/en/ingredients`, … */
export function localePath(locale: Locale, to: string): string {
  const rest = to === '/' ? '' : to.startsWith('/') ? to : `/${to}`
  return `/${locale}${rest}`
}

export function stripLocale(pathname: string): string {
  const m = pathname.match(/^\/(ka|en)(\/.*)?$/)
  if (!m) return pathname || '/'
  return m[2] || '/'
}

export function parseLocale(segment: string | undefined): Locale | null {
  return segment === 'ka' || segment === 'en' ? segment : null
}
