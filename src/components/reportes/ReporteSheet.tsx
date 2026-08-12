'use client';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import { FileDown, X, GitCompareArrows, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ReporteKPIs } from './ReporteKPIs';
import { ReporteTabla } from './ReporteTabla';
import { ReporteEmpty } from './ReporteEmpty';
import { ReporteChart } from './ReporteChart';
import { resolverPeriodo, TIPOS_CIERRE } from '@/lib/services/reportes/periodosService';
import { subDays } from 'date-fns';
import type { ReportDefinition, ReportData, PeriodoCierre, TipoCierre } from '@/lib/services/reportes/types';

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
  const [comparisonData, setComparisonData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [comparisonTipo, setComparisonTipo] = useState<TipoCierre>(periodo.tipo);
  const [comparisonLoading, setComparisonLoading] = useState(false);

  // Cerrar con Escape
  useEffect(() => {
    if (open) {
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onOpenChange(false);
      };
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }
  }, [open, onOpenChange]);

  // Cargar datos del reporte
  useEffect(() => {
    if (!open || !reporte || !orgId) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setData(null);
    setComparisonData(null);
    setComparing(false);
    setComparisonTipo(periodo.tipo);

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

  // Cargar datos de comparación
  const loadComparison = useCallback(async () => {
    if (!reporte || !orgId) return;
    setComparisonLoading(true);
    try {
      // Calcular período anterior del tipo seleccionado
      // Usar el día anterior al inicio del período actual como referencia
      const refDate = new Date(periodo.fechaInicio + 'T12:00:00');
      const dayBefore = subDays(refDate, 1);
      const compPeriodo = resolverPeriodo(comparisonTipo, dayBefore);
      const result = await reporte.fetch(orgId, compPeriodo);
      setComparisonData(result);
    } catch {
      setComparisonData(null);
    } finally {
      setComparisonLoading(false);
    }
  }, [reporte, orgId, periodo, comparisonTipo]);

  // Ejecutar comparación cuando se activa o cambia el tipo
  useEffect(() => {
    if (comparing) {
      loadComparison();
    } else {
      setComparisonData(null);
    }
  }, [comparing, loadComparison]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex animate-in fade-in duration-200">
      <PanelGroup orientation="horizontal" className="h-full w-full">
        {/* Panel izquierdo - backdrop clickable para cerrar */}
        <Panel
          defaultSize="50%"
          minSize="15%"
          maxSize="85%"
          className="bg-black/50 backdrop-blur-sm"
        >
          <div
            className="h-full w-full cursor-pointer"
            onClick={() => onOpenChange(false)}
          />
        </Panel>

        {/* Handle de resize */}
        <PanelResizeHandle className="w-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-blue-500 dark:hover:bg-blue-500 active:bg-blue-600 transition-colors cursor-ew-resize relative z-10" />

        {/* Panel derecho - contenido del reporte */}
        <Panel
          defaultSize="50%"
          minSize="20%"
          maxSize="85%"
          className="bg-white dark:bg-gray-900 rounded-l-2xl shadow-2xl overflow-hidden"
        >
          <div className="h-full flex flex-col">
            {/* Header fijo */}
            <div className="shrink-0 border-b border-gray-200 dark:border-gray-700 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {reporte?.titulo ?? ''}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                    {reporte?.descripcion} · {periodo.etiqueta}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Toggle comparación */}
                  <Button
                    variant={comparing ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      if (comparing) {
                        setComparing(false);
                        setComparisonData(null);
                      } else {
                        setComparing(true);
                      }
                    }}
                    className={`h-8 text-xs ${comparing ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                    title={comparing ? 'Quitar comparación' : 'Comparar con período anterior'}
                  >
                    <GitCompareArrows className="h-3.5 w-3.5 mr-1" />
                    {comparing ? 'Comparando' : 'Comparar'}
                  </Button>

                  {data && onExportPDF && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onExportPDF(data)}
                      className="h-8 text-xs print:hidden"
                    >
                      <FileDown className="h-3.5 w-3.5 mr-1" />
                      PDF
                    </Button>
                  )}

                  <button
                    onClick={() => onOpenChange(false)}
                    className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Cerrar</span>
                  </button>
                </div>
              </div>

              {/* Barra de comparación */}
              {comparing && (
                <div className="mt-3 flex items-center gap-2 flex-wrap bg-blue-50 dark:bg-blue-950/40 rounded-lg px-3 py-2 border border-blue-100 dark:border-blue-900/50">
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300 flex items-center gap-1">
                    <GitCompareArrows className="h-3.5 w-3.5" />
                    Comparar con:
                  </span>
                  <select
                    value={comparisonTipo}
                    onChange={(e) => setComparisonTipo(e.target.value as TipoCierre)}
                    className="h-7 text-xs rounded-md border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800 px-2 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    title="Tipo de período de comparación"
                  >
                    {TIPOS_CIERRE.filter((t) => t.value !== 'personalizado').map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {comparisonLoading ? (
                    <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Cargando...
                    </span>
                  ) : comparisonData ? (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded bg-blue-600 text-white font-medium">
                        {periodo.etiqueta}
                      </span>
                      <span className="text-gray-400">vs</span>
                      <span className="px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium">
                        {comparisonData.periodo.etiqueta}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 dark:text-gray-500">Sin datos</span>
                  )}
                </div>
              )}
            </div>

            {/* Contenido scrolleable */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-5">
                {loading && (
                  <div className="py-16 space-y-4">
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-[280px] w-full rounded-lg" />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-20 rounded-lg" />
                      ))}
                    </div>
                    <Skeleton className="h-40 w-full rounded-lg" />
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
                    {/* KPIs */}
                    {data.kpis.length > 0 && (
                      <ReporteKPIs
                        kpis={data.kpis}
                        comparisonKpis={comparing ? comparisonData?.kpis : undefined}
                      />
                    )}

                    {/* Tabla */}
                    {data.filas.length > 0 ? (
                      <ReporteTabla data={data} comparisonData={comparing ? comparisonData : undefined} />
                    ) : (
                      <ReporteEmpty />
                    )}

                    {/* Gráfico (debajo de la tabla) */}
                    {data.filas.length > 0 && (
                      <ReporteChart
                        data={data}
                        comparisonData={comparing ? comparisonData : undefined}
                      />
                    )}

                  </>
                )}
              </div>
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>,
    document.body
  );
}
