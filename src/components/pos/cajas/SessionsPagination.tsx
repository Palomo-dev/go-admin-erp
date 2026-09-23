'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useKitT } from '@/components/kit/useIdiomaKit';

interface SessionsPaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  itemName?: string;
}

export function SessionsPagination({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  itemName,
}: SessionsPaginationProps) {
  const t = useTranslations('cajas.detalle');
  const tKit = useKitT();
  const sustantivo = itemName ?? t('paginacion.sesiones');
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600 dark:text-gray-400">{t('paginacion.mostrar')}</span>
        <Select
          value={pageSize.toString()}
          onValueChange={(value) => onPageSizeChange(parseInt(value))}
        >
          <SelectTrigger className="w-[80px]" aria-label={tKit('paginacion.porPaginaEtiqueta')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="20">20</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-gray-600 dark:text-gray-400">{t('paginacion.porPagina')}</span>
      </div>

      <div className="text-sm text-gray-600 dark:text-gray-400">
        {totalItems > 0
          ? t.rich('paginacion.resumen', {
              desde: startItem,
              hasta: endItem,
              total: totalItems,
              sustantivo,
              b: (chunks) => <span className="font-medium">{chunks}</span>,
            })
          : t('paginacion.sinElementos', { sustantivo })}
      </div>

      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={() => onPageChange(1)} disabled={currentPage === 1} aria-label={tKit('paginacion.primera')}>
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} aria-label={tKit('paginacion.anterior')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 7) {
              pageNum = i + 1;
            } else if (currentPage <= 4) {
              pageNum = i + 1;
            } else if (currentPage >= totalPages - 3) {
              pageNum = totalPages - 6 + i;
            } else {
              pageNum = currentPage - 3 + i;
            }
            if (pageNum < 1 || pageNum > totalPages) return null;
            return (
              <Button
                key={pageNum}
                variant={currentPage === pageNum ? 'default' : 'outline'}
                size="sm"
                onClick={() => onPageChange(pageNum)}
                className="w-10"
              >
                {pageNum}
              </Button>
            );
          })}
        </div>

        <Button variant="outline" size="sm" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} aria-label={tKit('paginacion.siguiente')}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages} aria-label={tKit('paginacion.ultima')}>
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
