'use client';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import { FileDown, X, GitCompareArrows, Loader2, Calendar } from 'lucide-react';
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
  onExportPDF?: (data: ReportData, comparisonData?: ReportData) => void;
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
  const [manualMode, setManualMode] = useState(false);
  const [manualMonth, setManualMonth] = useState(new Date().getMonth());
  const [manualYear, setManualYear] = useState(new Date().getFullYear());
  const [manualQuarter, setManualQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1);
  const [manualHalf, setManualHalf] = useState(new Date().getMonth() < 6 ? 1 : 2);
  const [manualDate, setManualDate] = useState('');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

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
      let compPeriodo: PeriodoCierre;
      if (manualMode) {
        // Construir fecha de referencia según el tipo seleccionado
        let refDate: Date;
        if (comparisonTipo === 'diario' || comparisonTipo === 'semanal') {
          refDate = manualDate ? new Date(manualDate + 'T12:00:00') : new Date();
        } else if (comparisonTipo === 'quincenal') {
          refDate = new Date(manualYear, manualMonth, manualHalf === 1 ? 1 : 16, 12, 0, 0);
        } else if (comparisonTipo === 'mensual') {
          refDate = new Date(manualYear, manualMonth, 15, 12, 0, 0);
        } else if (comparisonTipo === 'trimestral') {
          refDate = new Date(manualYear, (manualQuarter - 1) * 3 + 1, 15, 12, 0, 0);
        } else if (comparisonTipo === 'semestral') {
          refDate = new Date(manualYear, manualHalf === 1 ? 2 : 8, 15, 12, 0, 0);
        } else if (comparisonTipo === 'anual') {
          refDate = new Date(manualYear, 6, 15, 12, 0, 0);
        } else {
          refDate = new Date();
        }
        compPeriodo = resolverPeriodo(comparisonTipo, refDate);
      } else {
        const refDate = new Date(periodo.fechaInicio + 'T12:00:00');
        const dayBefore = subDays(refDate, 1);
        compPeriodo = resolverPeriodo(comparisonTipo, dayBefore);
      }
      const result = await reporte.fetch(orgId, compPeriodo);
      setComparisonData(result);
    } catch {
      setComparisonData(null);
    } finally {
      setComparisonLoading(false);
    }
  }, [reporte, orgId, periodo, comparisonTipo, manualMode, manualDate, manualMonth, manualYear, manualQuarter, manualHalf]);

  // Ejecutar comparación cuando se activa o cambia el tipo
  useEffect(() => {
    if (comparing) {
      loadComparison();
    } else {
      setComparisonData(null);
    }
  }, [comparing, loadComparison]);

  if (!open) return null;

  const renderContent = () => (
    <div className="h-full flex flex-col">
      {/* Header fijo */}
      <div className="shrink-0 border-b border-gray-200 dark:border-gray-700 px-3 py-3 md:px-5 md:py-4">
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
                    className={`h-9 text-xs touch-manipulation ${comparing ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                    title={comparing ? 'Quitar comparación' : 'Comparar con período anterior'}
                  >
                    <GitCompareArrows className="h-3.5 w-3.5 mr-1" />
                    {comparing ? 'Comparando' : 'Comparar'}
                  </Button>

                  {data && onExportPDF && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onExportPDF(data, comparing ? comparisonData ?? undefined : undefined)}
                      className="h-9 text-xs print:hidden touch-manipulation"
                    >
                      <FileDown className="h-3.5 w-3.5 mr-1" />
                      PDF
                    </Button>
                  )}

                  <button
                    onClick={() => onOpenChange(false)}
                    className="p-2.5 -mr-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors touch-manipulation"
                  >
                    <X className="h-5 w-5" />
                    <span className="sr-only">Cerrar</span>
                  </button>
                </div>
              </div>

              {/* Barra de comparación */}
              {comparing && (
                <div className="mt-3 space-y-2 bg-blue-50 dark:bg-blue-950/40 rounded-lg px-3 py-2 border border-blue-100 dark:border-blue-900/50">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300 flex items-center gap-1">
                      <GitCompareArrows className="h-3.5 w-3.5" />
                      Comparar con:
                    </span>
                    {/* Select de tipo de período (siempre visible) */}
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
                    {/* Toggle modo manual / automático */}
                    <button
                      onClick={() => {
                        setManualMode(!manualMode);
                        if (!manualMode) {
                          // Al activar manual, pre-llenar con período anterior
                          const refDate = new Date(periodo.fechaInicio + 'T12:00:00');
                          const dayBefore = subDays(refDate, 1);
                          const prev = resolverPeriodo(comparisonTipo, dayBefore);
                          const prevDate = new Date(prev.fechaInicio + 'T12:00:00');
                          setManualMonth(prevDate.getMonth());
                          setManualYear(prevDate.getFullYear());
                          setManualQuarter(Math.floor(prevDate.getMonth() / 3) + 1);
                          setManualHalf(prevDate.getMonth() < 6 ? 1 : 2);
                          setManualDate(prev.fechaInicio);
                        }
                      }}
                      className={`h-7 text-xs rounded-md px-2 font-medium transition-colors ${
                        manualMode
                          ? 'bg-blue-600 text-white'
                          : 'border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-gray-700'
                      }`}
                      title="Seleccionar período manualmente"
                    >
                      <Calendar className="h-3 w-3 inline mr-1" />
                      {manualMode ? 'Manual' : 'Auto'}
                    </button>
                    {manualMode && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(comparisonTipo === 'diario' || comparisonTipo === 'semanal') && (
                          <input
                            type="date"
                            value={manualDate}
                            onChange={(e) => setManualDate(e.target.value)}
                            className="h-7 text-xs rounded-md border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800 px-2 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                        {comparisonTipo === 'quincenal' && (
                          <>
                            <select
                              value={manualHalf}
                              onChange={(e) => setManualHalf(Number(e.target.value))}
                              className="h-7 text-xs rounded-md border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800 px-2 text-gray-700 dark:text-gray-300"
                            >
                              <option value={1}>1ra quincena</option>
                              <option value={2}>2da quincena</option>
                            </select>
                            <select
                              value={manualMonth}
                              onChange={(e) => setManualMonth(Number(e.target.value))}
                              className="h-7 text-xs rounded-md border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800 px-2 text-gray-700 dark:text-gray-300"
                            >
                              {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map((m, i) => (
                                <option key={i} value={i}>{m}</option>
                              ))}
                            </select>
                          </>
                        )}
                        {comparisonTipo === 'mensual' && (
                          <select
                            value={manualMonth}
                            onChange={(e) => setManualMonth(Number(e.target.value))}
                            className="h-7 text-xs rounded-md border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800 px-2 text-gray-700 dark:text-gray-300"
                          >
                            {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((m, i) => (
                              <option key={i} value={i}>{m}</option>
                            ))}
                          </select>
                        )}
                        {(comparisonTipo === 'trimestral') && (
                          <select
                            value={manualQuarter}
                            onChange={(e) => setManualQuarter(Number(e.target.value))}
                            className="h-7 text-xs rounded-md border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800 px-2 text-gray-700 dark:text-gray-300"
                          >
                            <option value={1}>Q1 (Ene-Mar)</option>
                            <option value={2}>Q2 (Abr-Jun)</option>
                            <option value={3}>Q3 (Jul-Sep)</option>
                            <option value={4}>Q4 (Oct-Dic)</option>
                          </select>
                        )}
                        {(comparisonTipo === 'semestral') && (
                          <select
                            value={manualHalf}
                            onChange={(e) => setManualHalf(Number(e.target.value))}
                            className="h-7 text-xs rounded-md border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800 px-2 text-gray-700 dark:text-gray-300"
                          >
                            <option value={1}>S1 (Ene-Jun)</option>
                            <option value={2}>S2 (Jul-Dic)</option>
                          </select>
                        )}
                        {(comparisonTipo === 'mensual' || comparisonTipo === 'quincenal' || comparisonTipo === 'trimestral' || comparisonTipo === 'semestral' || comparisonTipo === 'anual') && (
                          <select
                            value={manualYear}
                            onChange={(e) => setManualYear(Number(e.target.value))}
                            className="h-7 text-xs rounded-md border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800 px-2 text-gray-700 dark:text-gray-300"
                          >
                            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                              <option key={y} value={y}>{y}</option>
                            ))}
                          </select>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => loadComparison()}
                          disabled={comparisonLoading}
                          className="h-8 text-xs px-2 bg-blue-600 hover:bg-blue-700 text-white touch-manipulation"
                        >
                          {comparisonLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Aplicar'}
                        </Button>
                      </div>
                    )}
                    {comparisonLoading && !manualMode ? (
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
                      !manualMode && <span className="text-xs text-gray-400 dark:text-gray-500">Sin datos</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Contenido scrolleable */}
            <div className="flex-1 overflow-y-auto px-3 py-3 md:px-5 md:py-4">
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
  );

  return createPortal(
    <div className="fixed inset-0 z-[100] flex animate-in fade-in duration-200">
      {isMobile ? (
        /* Móvil: modal centrado con overlay */
        <>
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => onOpenChange(false)}
          />
          <div
            className="absolute inset-x-3 top-[5%] bottom-[5%] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 fade-in duration-200 z-10 touch-manipulation"
            onClick={(e) => e.stopPropagation()}
          >
            {renderContent()}
          </div>
        </>
      ) : (
        /* Desktop: paneles redimensionables */
        <PanelGroup orientation="horizontal" className="h-full w-full">
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
          <PanelResizeHandle className="w-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-blue-500 dark:hover:bg-blue-500 active:bg-blue-600 transition-colors cursor-ew-resize relative z-10" />
          <Panel
            defaultSize="50%"
            minSize="20%"
            maxSize="85%"
            className="bg-white dark:bg-gray-900 rounded-l-2xl shadow-2xl overflow-hidden"
          >
            {renderContent()}
          </Panel>
        </PanelGroup>
      )}
    </div>,
    document.body
  );
}
