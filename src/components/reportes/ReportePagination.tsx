'use client';

import { useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

const PAGE_SIZES = [25, 50, 100];

interface ReportePaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function ReportePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: ReportePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = page * pageSize;
  const end = Math.min(start + pageSize, total);

  const pageNumbers = useMemo(() => {
    const pages: (number | 'ellipsis')[] = [];
    const maxButtons = 5;

    if (totalPages <= maxButtons + 2) {
      for (let i = 0; i < totalPages; i++) pages.push(i);
      return pages;
    }

    pages.push(0);

    const left = Math.max(1, page - 1);
    const right = Math.min(totalPages - 2, page + 1);

    if (left > 1) pages.push('ellipsis');
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages - 2) pages.push('ellipsis');

    pages.push(totalPages - 1);
    return pages;
  }, [page, totalPages]);

  if (total <= PAGE_SIZES[0]) return null;

  const btnBase =
    'inline-flex items-center justify-center h-8 min-w-8 px-2 rounded-md text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400 pt-1">
      <div className="flex items-center gap-3">
        <span>
          {start + 1}–{end} de {total}
        </span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="rounded-md border border-gray-200 dark:border-gray-700 bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s} por página
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(0)}
          disabled={page === 0}
          className={`${btnBase} hover:bg-gray-100 dark:hover:bg-gray-800`}
          aria-label="Primera página"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className={`${btnBase} hover:bg-gray-100 dark:hover:bg-gray-800`}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pageNumbers.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e-${i}`} className="px-1 text-gray-400">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`${btnBase} font-medium ${
                p === page
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {p + 1}
            </button>
          ),
        )}

        <button
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className={`${btnBase} hover:bg-gray-100 dark:hover:bg-gray-800`}
          aria-label="Página siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => onPageChange(totalPages - 1)}
          disabled={page >= totalPages - 1}
          className={`${btnBase} hover:bg-gray-100 dark:hover:bg-gray-800`}
          aria-label="Última página"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
