'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ReporteCard, ModuloIcon } from './ReporteCard';
import type { ModuloReportes, ReportDefinition } from '@/lib/services/reportes/types';

interface ModuloSectionProps {
  modulo: ModuloReportes;
  onReporteClick: (reporte: ReportDefinition) => void;
  defaultOpen?: boolean;
}

export function ModuloSection({ modulo, onReporteClick, defaultOpen = true }: ModuloSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="space-y-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left group"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
        )}
        <ModuloIcon name={modulo.icono} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {modulo.nombre}
        </h3>
        <span className="text-xs text-gray-400">({modulo.reportes.length})</span>
      </button>

      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pl-6">
          {modulo.reportes.map((r) => (
            <ReporteCard key={r.id} reporte={r} onClick={() => onReporteClick(r)} />
          ))}
        </div>
      )}
    </div>
  );
}
