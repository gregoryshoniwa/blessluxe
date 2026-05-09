"use client";

import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";

interface PaginationProps {
  page: number;            // 1-based current page
  pageSize: number;        // items per page
  total: number;           // total rows server-side
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  /** Override the noun in "items" — defaults to "items". */
  itemNoun?: string;
}

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100];

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  itemNoun = "items",
}: PaginationProps) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), lastPage);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
      style={{ borderTop: "1px solid var(--line-soft)", background: "var(--cream)" }}
    >
      <p className="text-[11px] uppercase tracking-luxe text-[var(--ink-muted)]">
        Showing{" "}
        <span className="font-display text-base text-[var(--ink)]">{start}</span>
        <span className="mx-1 text-[var(--ink-muted)]">–</span>
        <span className="font-display text-base text-[var(--ink)]">{end}</span>{" "}
        of{" "}
        <span className="font-display text-base text-[var(--ink)]">{total}</span>{" "}
        {itemNoun}
      </p>

      <div className="flex items-center gap-3">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-[10px] uppercase tracking-luxe text-[var(--ink-muted)]">
            Per page
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="select py-1.5 pr-7 text-xs w-[68px]"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}

        <nav className="flex items-center gap-0.5" aria-label="Pagination">
          <PageBtn
            disabled={safePage === 1}
            onClick={() => onPageChange(1)}
            label="First page"
            icon={<ChevronsLeft className="h-3.5 w-3.5" />}
          />
          <PageBtn
            disabled={safePage === 1}
            onClick={() => onPageChange(safePage - 1)}
            label="Previous page"
            icon={<ChevronLeft className="h-3.5 w-3.5" />}
          />

          <span className="px-3 text-[11px] tracking-luxe text-[var(--ink-light)]">
            <span className="font-display text-base text-[var(--ink)]">{safePage}</span>
            <span className="mx-1 text-[var(--ink-muted)]">/</span>
            <span className="text-[var(--ink-muted)]">{lastPage}</span>
          </span>

          <PageBtn
            disabled={safePage >= lastPage}
            onClick={() => onPageChange(safePage + 1)}
            label="Next page"
            icon={<ChevronRight className="h-3.5 w-3.5" />}
          />
          <PageBtn
            disabled={safePage >= lastPage}
            onClick={() => onPageChange(lastPage)}
            label="Last page"
            icon={<ChevronsRight className="h-3.5 w-3.5" />}
          />
        </nav>
      </div>
    </div>
  );
}

function PageBtn({
  disabled,
  onClick,
  label,
  icon,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        border: "1px solid var(--line)",
        background: "white",
        color: "var(--ink-light)",
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        const t = e.currentTarget as HTMLButtonElement;
        t.style.background = "var(--cream-dark)";
        t.style.color = "var(--gold-dark)";
        t.style.borderColor = "var(--gold)";
      }}
      onMouseLeave={(e) => {
        const t = e.currentTarget as HTMLButtonElement;
        t.style.background = "white";
        t.style.color = "var(--ink-light)";
        t.style.borderColor = "var(--line)";
      }}
    >
      {icon}
    </button>
  );
}

/** Slice an array client-side. Useful when the API returns the full list. */
export function paginate<T>(rows: T[], page: number, pageSize: number): T[] {
  const start = Math.max(0, (page - 1) * pageSize);
  return rows.slice(start, start + pageSize);
}
