import { en } from './locales/en'
import { ka, type Messages } from './locales/ka'

export type Locale = 'ka' | 'en'
export type { Messages }

const catalogs: Record<Locale, Messages> = { ka, en }

export type MessageKey = LeafPaths<Messages>

type LeafPaths<T, Prefix extends string = ''> = T extends string
  ? Prefix
  : {
      [K in keyof T & string]: LeafPaths<T[K], Prefix extends '' ? K : `${Prefix}.${K}`>
    }[keyof T & string]

function getByPath(obj: unknown, path: string): string | undefined {
  const parts = path.split('.')
  let cur: unknown = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return typeof cur === 'string' ? cur : undefined
}

export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const raw = getByPath(catalogs[locale], key) ?? getByPath(catalogs.ka, key) ?? key
  if (!vars) return raw
  return raw.replace(/\{(\w+)\}/g, (_match: string, name: string) =>
    vars[name] != null ? String(vars[name]) : `{${name}}`,
  )
}

export function numberLocale(locale: Locale): string {
  return locale === 'ka' ? 'ka-GE' : 'en-US'
}

/** Map DB / API Georgian movement labels to i18n keys. */
export function movementLabel(locale: Locale, type: string): string {
  const map: Record<string, MessageKey> = {
    შესყიდვა: 'movement.purchase',
    წარმოება: 'movement.production',
    ჩამოწერა: 'movement.writeOff',
  }
  const key = map[type]
  return key ? translate(locale, key) : type
}

/** Map stored employee status to display string. */
export function statusLabel(locale: Locale, status: string): string {
  if (status === 'აქტიური') return translate(locale, 'hr.statusActive')
  return status
}

/** Map stored expense type to display string. */
export function expenseTypeLabel(locale: Locale, type: string): string {
  const map: Record<string, MessageKey> = {
    ქირა: 'expenses.typeRent',
    იჯარა: 'expenses.typeRent',
    კომუნალური: 'expenses.typeUtilities',
    სხვა: 'expenses.typeOther',
  }
  const key = map[type]
  return key ? translate(locale, key) : type
}
