export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || res.statusText)
  }
  return data as T
}

export function today() {
  return new Date().toISOString().slice(0, 10)
}

export function money(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function qty(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
}

export type NavItem = { to: string; label: string }

export const NAV: NavItem[] = [
  { to: '/', label: 'მოგება-ზარალი' },
  { to: '/ingredients', label: 'ინგრედიენტები' },
  { to: '/resale', label: 'შესყიდული' },
  { to: '/products', label: 'პროდუქცია' },
  { to: '/recipes', label: 'რეცეპტები' },
  { to: '/purchases', label: 'შესყიდვები' },
  { to: '/production', label: 'წარმოება' },
  { to: '/sales', label: 'გაყიდვები' },
  { to: '/write-offs', label: 'ჩამოწერა' },
  { to: '/hr', label: 'HR / ხელფასი' },
  { to: '/expenses', label: 'ზედნადები' },
]
