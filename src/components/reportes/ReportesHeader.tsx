'use client';

import { Button } from '@/components/ui/button';
import { RefreshCw, FileDown, MessageSquare } from 'lucide-react';
import { PeriodoSelector } from './PeriodoSelector';
import type { PeriodoCierre } from '@/lib/services/reportes/types';

interface ReportesHeaderProps {
  periodo: PeriodoCierre;
  onPeriodoChange: (p: PeriodoCierre) => void;
  onRefresh: () => void;
  onExportCierre: () => void;
  onOpenChat: () => void;
  isRefreshing?: boolean;
  isExporting?: boolean;
}

export function ReportesHeader({
  periodo,
  onPeriodoChange,
  onRefresh,
  onExportCierre,
  onOpenChat,
  isRefreshing,
  isExporting,
}: ReportesHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 print:hidden">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Reportes</h1>
        <PeriodoSelector periodo={periodo} onChange={onPeriodoChange} />
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="h-9"
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onExportCierre}
          disabled={isExporting}
          className="h-9"
        >
          <FileDown className="h-4 w-4 mr-1" />
          {isExporting ? 'Generando...' : 'PDF Cierre'}
        </Button>

        <Button
          variant="default"
          size="sm"
          onClick={onOpenChat}
          className="h-9 bg-blue-600 hover:bg-blue-700"
        >
          <MessageSquare className="h-4 w-4 mr-1" />
          Chat IA
        </Button>
      </div>
    </div>
  );
}
