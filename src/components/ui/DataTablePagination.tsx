'use client';

import { cn } from '@/utils/Utils';
import { Pagination } from '@/components/kit/Pagination';

/**
 * Adaptador de la paginación del kit (`@/components/kit` › `Pagination`) para
 * las ~24 pantallas que ya usaban este componente. PATRONES-TRANSVERSALES.md §2:
 * una sola paginación en toda la app. El código nuevo usa `Pagination` del kit
 * directamente (con `sustantivo` del dominio y `cargando`).
 */
interface DataTablePaginationProps {
  currentPage: number;
  /** Se conserva por compatibilidad: el kit lo deriva de `totalItems` y `pageSize`. */
  totalPages?: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export function DataTablePagination({
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className = '',
}: DataTablePaginationProps) {
  if (totalItems === 0) return null;
  return (
    <Pagination
      pagina={currentPage}
      tamano={pageSize}
      total={totalItems}
      onPaginaChange={onPageChange}
      onTamanoChange={onPageSizeChange}
      opcionesTamano={pageSizeOptions}
      className={cn('py-4', className)}
    />
  );
}
