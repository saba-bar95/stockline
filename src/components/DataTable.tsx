import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { usePrefs } from "../preferences/PreferencesContext";
import { SelectField } from "./SelectField";
import { Button, LoadingState } from "./ui";

export type Column<T> = {
  key: string;
  label: string;
  title?: string;
  sortable?: boolean;
  filterable?: boolean;
  /** Column filter UI. Default `"text"` when filterable. */
  filterType?: "text" | "select";
  /** Optional fixed select options; otherwise derived from row values. */
  filterOptions?: Array<{ value: string; label: string }>;
  sortValue?: (row: T) => string | number | null | undefined;
  filterValue?: (row: T) => string;
  render: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
};

type Props<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T, index: number) => string | number;
  loading?: boolean;
  emptyText?: string;
  onRowClick?: (row: T) => void;
  onRowDoubleClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  defaultSortKey?: string;
  defaultSortDir?: "asc" | "desc";
  defaultPageSize?: 20 | 30 | 50;
  /** Hide global search (e.g. compact tables in modals). */
  searchable?: boolean;
};

const PAGE_SIZES = [20, 30, 50] as const;

function cmp(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
  locale: string,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), locale);
}

function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading = false,
  emptyText,
  onRowClick,
  onRowDoubleClick,
  rowClassName,
  defaultSortKey,
  defaultSortDir = "asc",
  defaultPageSize = 20,
  searchable = true,
}: Props<T>) {
  const { t, numberLocale } = usePrefs();
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState(
    defaultSortKey ?? columns.find((c) => c.sortable !== false)?.key ?? "",
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSortDir);
  const [pageSize, setPageSize] = useState<number>(defaultPageSize);
  const [page, setPage] = useState(1);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter((row) => {
      for (const col of columns) {
        const raw = colFilters[col.key];
        if (raw == null || raw === "") continue;
        const fv =
          col.filterValue?.(row) ?? String(col.sortValue?.(row) ?? "");
        if (col.filterType === "select") {
          if (fv !== raw) return false;
        } else {
          const cf = raw.trim().toLowerCase();
          if (cf && !fv.toLowerCase().includes(cf)) return false;
        }
      }
      if (!q) return true;
      return columns.some((col) => {
        const fv = (
          col.filterValue?.(row) ?? String(col.sortValue?.(row) ?? "")
        ).toLowerCase();
        return fv.includes(q);
      });
    });
  }, [rows, columns, filter, colFilters]);

  const selectFilterOptions = useMemo(() => {
    const map: Record<string, Array<{ value: string; label: string }>> = {};
    for (const col of columns) {
      if (col.filterable === false || col.filterType !== "select") continue;
      if (col.filterOptions) {
        map[col.key] = col.filterOptions;
        continue;
      }
      const set = new Set<string>();
      for (const row of rows) {
        const v = (
          col.filterValue?.(row) ?? String(col.sortValue?.(row) ?? "")
        ).trim();
        if (v) set.add(v);
      }
      map[col.key] = [...set]
        .sort((a, b) => a.localeCompare(b, numberLocale))
        .map((v) => ({ value: v, label: v }));
    }
    return map;
  }, [columns, rows, numberLocale]);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return filtered;
    const copy = [...filtered];
    const sortLocale = numberLocale;
    copy.sort((a, b) => {
      const d = cmp(col.sortValue?.(a), col.sortValue?.(b), sortLocale);
      return sortDir === "asc" ? d : -d;
    });
    return copy;
  }, [filtered, columns, sortKey, sortDir, numberLocale]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  const showColFilters = columns.some((c) => c.filterable !== false);

  return (
    <div className="space-y-4">
      {searchable ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="field mb-0 min-w-0 flex-1 sm:max-w-sm">
            {t("common.search")}
            <input
              type="search"
              className="ui-input"
              placeholder={t("common.searchPlaceholder")}
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-160 border-collapse text-left text-[0.95rem]">
          <thead>
            <tr className="border-b border-line bg-teal-soft/60">
              {columns.map((col) => {
                const full = col.title ?? col.label;
                const sortable = col.sortable !== false;
                const active = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    title={full}
                    onClick={sortable ? () => toggleSort(col.key) : undefined}
                    className={cn(
                      "border-r border-line/70 px-3 py-3 text-xs font-semibold tracking-wide text-ink-soft uppercase last:border-r-0",
                      sortable &&
                        "cursor-pointer select-none hover:text-teal-deep",
                      active && "text-teal-deep",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                    )}
                  >
                    {col.label}
                    {sortable && active ? (
                      <span className="ml-1 normal-case">
                        {sortDir === "asc" ? "↑" : "↓"}
                      </span>
                    ) : null}
                  </th>
                );
              })}
            </tr>
            {showColFilters ? (
              <tr className="border-b border-line bg-paper/80">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="border-r border-line/70 p-1.5 last:border-r-0"
                  >
                    {col.filterable !== false ? (
                      col.filterType === "select" ? (
                        <SelectField
                          className="h-8 text-sm"
                          searchable={false}
                          aria-label={t("common.filterCol", {
                            label: col.title ?? col.label,
                          })}
                          placeholder={t("common.filterAll")}
                          value={colFilters[col.key] ?? ""}
                          onChange={(v) => {
                            setColFilters((prev) => ({
                              ...prev,
                              [col.key]: v,
                            }));
                            setPage(1);
                          }}
                          options={[
                            { value: "", label: t("common.filterAll") },
                            ...(selectFilterOptions[col.key] ?? []),
                          ]}
                        />
                      ) : (
                        <input
                          type="search"
                          className="ui-input h-8 text-sm"
                          aria-label={t("common.filterCol", {
                            label: col.title ?? col.label,
                          })}
                          title={col.title ?? col.label}
                          placeholder={t("common.filter")}
                          value={colFilters[col.key] ?? ""}
                          onChange={(e) => {
                            setColFilters((prev) => ({
                              ...prev,
                              [col.key]: e.target.value,
                            }));
                            setPage(1);
                          }}
                        />
                      )
                    ) : null}
                  </th>
                ))}
              </tr>
            ) : null}
          </thead>
          <tbody
            key={`${safePage}-${pageSize}-${sortKey}-${sortDir}-${filter}`}
          >
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8">
                  <LoadingState label={t("common.loading")} />
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-ink-muted italic"
                >
                  {emptyText ?? t("common.empty")}
                </td>
              </tr>
            ) : (
              pageRows.map((row, index) => (
                <tr
                  key={rowKey(row, (safePage - 1) * pageSize + index)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onDoubleClick={
                    onRowDoubleClick ? () => onRowDoubleClick(row) : undefined
                  }
                  className={cn(
                    "table-row-anim border-b border-line/80 last:border-0",
                    (onRowClick || onRowDoubleClick) && "cursor-pointer",
                    "transition-colors duration-150 hover:bg-teal-soft/40",
                    rowClassName?.(row),
                  )}
                  style={{ animationDelay: `${Math.min(index, 12) * 18}ms` }}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "border-r border-line/70 px-3 py-2.5 tabular-nums text-ink last:border-r-0",
                        col.align === "right" && "text-right",
                        col.align === "center" && "text-center",
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

      <div className="flex flex-col gap-3 border-t border-line/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <SelectField
            className="w-18"
            searchable={false}
            aria-label={t("common.perPage")}
            value={String(pageSize)}
            onChange={(v) => {
              setPageSize(Number(v) as 20 | 30 | 50);
              setPage(1);
            }}
            options={PAGE_SIZES.map((n) => ({
              value: String(n),
              label: String(n),
            }))}
          />
          <p className="text-sm text-ink-muted tabular-nums">
            {sorted.length === 0
              ? "0"
              : `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, sorted.length)}`}
            <span className="text-ink-muted/70"> / {sorted.length}</span>
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 sm:justify-end">
          <Button
            variant="secondary"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => setPage(1)}
          >
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
            {t("common.page", { page: safePage, total: totalPages })}
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
      </div>
    </div>
  );
}

export { DataTable };
