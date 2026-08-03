import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Button } from './ui'

export type Column<T> = {
  key: string
  label: string
  title?: string
  sortable?: boolean
  filterable?: boolean
  sortValue?: (row: T) => string | number | null | undefined
  filterValue?: (row: T) => string
  render: (row: T) => ReactNode
  align?: 'left' | 'right'
}

type Props<T> = {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T, index: number) => string | number
  emptyText?: string
  onRowDoubleClick?: (row: T) => void
  rowClassName?: (row: T) => string | undefined
  defaultSortKey?: string
  defaultSortDir?: 'asc' | 'desc'
  defaultPageSize?: 20 | 30 | 50
}

const PAGE_SIZES = [20, 30, 50] as const

function cmp(a: string | number | null | undefined, b: string | number | null | undefined): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'ka')
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  emptyText = 'მონაცემები არ არის',
  onRowDoubleClick,
  rowClassName,
  defaultSortKey,
  defaultSortDir = 'asc',
  defaultPageSize = 20,
}: Props<T>) {
  const [filter, setFilter] = useState('')
  const [sortKey, setSortKey] = useState(
    defaultSortKey ?? columns.find((c) => c.sortable !== false)?.key ?? '',
  )
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSortDir)
  const [pageSize, setPageSize] = useState<number>(defaultPageSize)
  const [page, setPage] = useState(1)
  const [colFilters, setColFilters] = useState<Record<string, string>>({})

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return rows.filter((row) => {
      for (const col of columns) {
        const cf = colFilters[col.key]?.trim().toLowerCase()
        if (cf) {
          const fv = (col.filterValue?.(row) ?? String(col.sortValue?.(row) ?? '')).toLowerCase()
          if (!fv.includes(cf)) return false
        }
      }
      if (!q) return true
      return columns.some((col) => {
        const fv = (col.filterValue?.(row) ?? String(col.sortValue?.(row) ?? '')).toLowerCase()
        return fv.includes(q)
      })
    })
  }, [rows, columns, filter, colFilters])

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey)
    if (!col) return filtered
    const copy = [...filtered]
    copy.sort((a, b) => {
      const d = cmp(col.sortValue?.(a), col.sortValue?.(b))
      return sortDir === 'asc' ? d : -d
    })
    return copy
  }, [filtered, columns, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize)

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="field mb-0 min-w-0 flex-1 sm:max-w-sm">
          ძებნა
          <input
            type="search"
            className="ui-input"
            placeholder="ფილტრი ყველა სვეტში…"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value)
              setPage(1)
            }}
          />
        </label>
        <div className="flex items-end gap-3">
          <label className="field mb-0 w-28">
            გვერდზე
            <select
              className="ui-input"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <p className="pb-2 text-sm text-ink-muted tabular-nums">
            {sorted.length === 0
              ? '0'
              : `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, sorted.length)}`}
            <span className="text-ink-muted/70"> / {sorted.length}</span>
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[640px] border-collapse text-left text-[0.95rem]">
          <thead>
            <tr className="border-b border-line bg-teal-soft/60">
              {columns.map((col) => {
                const full = col.title ?? col.label
                const sortable = col.sortable !== false
                const active = sortKey === col.key
                return (
                  <th
                    key={col.key}
                    title={full}
                    onClick={sortable ? () => toggleSort(col.key) : undefined}
                    className={cn(
                      'px-3 py-3 text-xs font-semibold tracking-wide text-ink-soft uppercase',
                      sortable && 'cursor-pointer select-none hover:text-teal-deep',
                      active && 'text-teal-deep',
                      col.align === 'right' && 'text-right',
                    )}
                  >
                    {col.label}
                    {sortable && active ? (
                      <span className="ml-1 normal-case">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    ) : null}
                  </th>
                )
              })}
            </tr>
            <tr className="border-b border-line bg-paper/80">
              {columns.map((col) => (
                <th key={col.key} className="p-1.5">
                  {col.filterable !== false ? (
                    <input
                      type="search"
                      className="ui-input h-8 text-sm"
                      aria-label={`ფილტრი: ${col.title ?? col.label}`}
                      title={col.title ?? col.label}
                      placeholder="ფილტრი"
                      value={colFilters[col.key] ?? ''}
                      onChange={(e) => {
                        setColFilters((prev) => ({ ...prev, [col.key]: e.target.value }))
                        setPage(1)
                      }}
                    />
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-ink-muted italic">
                  {emptyText}
                </td>
              </tr>
            ) : (
              pageRows.map((row, index) => (
                <tr
                  key={rowKey(row, (safePage - 1) * pageSize + index)}
                  onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}
                  className={cn(
                    'border-b border-line/80 last:border-0',
                    onRowDoubleClick && 'cursor-pointer',
                    'hover:bg-teal-soft/40',
                    rowClassName?.(row),
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-3 py-2.5 tabular-nums text-ink',
                        col.align === 'right' && 'text-right',
                      )}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-center gap-2 pt-1">
          <Button variant="secondary" size="sm" disabled={safePage <= 1} onClick={() => setPage(1)}>
            «
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ‹
          </Button>
          <span className="min-w-28 text-center text-sm text-ink-soft">
            გვერდი {safePage} / {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            ›
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={safePage >= totalPages}
            onClick={() => setPage(totalPages)}
          >
            »
          </Button>
        </div>
      ) : null}
    </div>
  )
}
