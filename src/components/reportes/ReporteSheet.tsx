'use client';

import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import { ReporteKPIs } from './ReporteKPIs';
import { ReporteTabla } from './ReporteTabla';
import { ReporteEmpty } from './ReporteEmpty';
import type { ReportDefinition, ReportData, PeriodoCierre } from '@/lib/services/reportes/types';

interface ReporteSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reporte: ReportDefinition | null;
  periodo: PeriodoCierre;
  orgId: number | null;
  onExportPDF?: (data: ReportData) => void;
}

export function ReporteSheet({
  open,
  onOpenChange,
  reporte,
  periodo,
  orgId,
  onExportPDF,
}: ReporteSheetProps) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !reporte || !orgId) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setData(null);

    reporte
      .fetch(orgId, periodo)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? 'Error al cargar el reporte');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, reporte, orgId, periodo]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[95vw] sm:w-[90vw] max-w-none overflow-y-auto"
      >
        <SheetHeader className="pr-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg">{reporte?.titulo ?? ''}</SheetTitle>
              <SheetDescription className="mt-1">
                {reporte?.descripcion} · {periodo.etiqueta}
              </SheetDescription>
            </div>
            {data && onExportPDF && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onExportPDF(data)}
                className="shrink-0 print:hidden"
              >
                <FileDown className="h-4 w-4 mr-1" />
                PDF
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-16 text-red-500 dark:text-red-400">
              <p className="text-sm font-medium">Error al cargar el reporte</p>
              <p className="text-xs mt-1">{error}</p>
            </div>
          )}

          {data && !loading && !error && (
            <>
              {data.kpis.length > 0 && <ReporteKPIs kpis={data.kpis} />}
              {data.filas.length > 0 ? (
                <ReporteTabla data={data} />
              ) : (
                <ReporteEmpty />
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
