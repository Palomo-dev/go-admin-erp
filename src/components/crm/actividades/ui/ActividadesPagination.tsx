'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/Utils';

interface ActividadesPaginationProps {
  currentPage: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
  className?: string;
}

export function ActividadesPagination({
  currentPage,
  totalPages,
  total,
  limit,
  onPageChange,
  loading = false,
  className
}: ActividadesPaginationProps) {
  // Calcular rango de elementos mostrados
  const startItem = ((currentPage - 1) * limit) + 1;
  const endItem = Math.min(currentPage * limit, total);

  // Generar números de página para mostrar
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      // Mostrar todas las páginas si son pocas
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Lógica para páginas con puntos suspensivos
      if (currentPage <= 3) {
        // Mostrar 1,2,3,4...última
        for (let i = 1; i <= 4; i++) {
          pages.push(i);
        }
        if (totalPages > 5) {
          pages.push('...');
          pages.push(totalPages);
        }
      } else if (currentPage >= totalPages - 2) {
        // Mostrar 1...últimas 4
        pages.push(1);
        if (totalPages > 5) {
          pages.push('...');
        }
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        // Mostrar 1...actual-1,actual,actual+1...última
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  if (totalPages <= 1) {
    return (
      <div className={cn("flex items-center justify-between text-sm text-gray-600 dark:text-gray-400", className)}>
        <span>
          Mostrando {total} de {total} actividades
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center justify-between", className)}>
      {/* Información de resultados */}
      <div className="text-sm text-gray-600 dark:text-gray-400">
        Mostrando {startItem}-{endItem} de {total} actividades
      </div>

      {/* Controles de paginación */}
      <div className="flex items-center gap-2">
        {/* Botón anterior */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1 || loading}
          className="flex items-center gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </Button>

        {/* Números de página */}
        <div className="flex items-center gap-1">
          {getPageNumbers().map((page, index) => (
            <React.Fragment key={index}>
              {page === '...' ? (
                <span className="px-2 py-1 text-gray-500">...</span>
              ) : (
                <Button
                  variant={currentPage === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => onPageChange(page as number)}
                  disabled={loading}
                  className={cn(
                    "w-8 h-8 p-0",
                    currentPage === page && "bg-primary text-primary-foreground"
                  )}
                >
                  {page}
                </Button>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Botón siguiente */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages || loading}
          className="flex items-center gap-1"
        >
          Siguiente
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
