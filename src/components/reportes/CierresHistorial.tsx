'use client';

import { useState, useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ReportePagination } from './ReportePagination';
import { Clock, CheckCircle2, Table2, List, FileDown, Loader2 } from 'lucide-react';
import type { CierreHistorico } from '@/lib/services/reportes/reportExecutionService';
import type { PeriodoCierre } from '@/lib/services/reportes/types';

interface CierresHistorialProps {
  cierres: CierreHistorico[];
  onDownloadPDF?: (cierre: CierreHistorico) => void;
}

interface FilaCierre {
  id: string;
  fecha: string;
  fechaFormateada: string;
  tipo: string;
  periodoEtiqueta: string;
  estado: string;
  totalReportes: number;
  ejecutadoPor: string;
}

function parseCierre(cierre: CierreHistorico): FilaCierre {
  const params = cierre.params as { periodo?: PeriodoCierre };
  const periodo = params?.periodo;
  const etiqueta = periodo?.etiqueta ?? cierre.report_id;
  const tipo = periodo?.tipo ?? '—';

  const snapshot = cierre.result_snapshot as { totalReportes?: number } | null;
  const totalReportes = snapshot?.totalReportes ?? 0;

  const fecha = new Date(cierre.created_at);
  const fechaFormateada = fecha.toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  return {
    id: cierre.id,
    fecha: cierre.created_at,
    fechaFormateada,
    tipo: tipo.charAt(0).toUpperCase() + tipo.slice(1),
    periodoEtiqueta: etiqueta,
    estado: cierre.status,
    totalReportes,
    ejecutadoPor: cierre.executed_by ?? 'Sistema',
  };
}

export function CierresHistorial({ cierres, onDownloadPDF }: CierresHistorialProps) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const filas = useMemo(() => cierres.map(parseCierre), [cierres]);

  const start = page * pageSize;
  const visibleRows = useMemo(
    () => filas.slice(start, start + pageSize),
    [filas, start, pageSize],
  );

  if (!cierres.length) return null;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-4 w-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Historial de Cierres
        </h3>
        <span className="text-xs text-gray-400">({cierres.length})</span>
      </div>

      <Tabs defaultValue="resumen">
        <TabsList className="bg-transparent h-auto p-0 gap-1 mb-3">
          <TabsTrigger
            value="resumen"
            className="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm data-[state=active]:bg-primary/10 data-[state=active]:shadow-none dark:data-[state=active]:bg-primary/20"
          >
            <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 transition-colors group-data-[state=active]:bg-primary">
              <List className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400 transition-colors group-data-[state=active]:text-white" />
            </div>
            <span className="whitespace-nowrap text-gray-600 dark:text-gray-400 transition-colors group-data-[state=active]:text-primary dark:group-data-[state=active]:text-primary font-medium">Resumen</span>
          </TabsTrigger>
          <TabsTrigger
            value="tabla"
            className="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm data-[state=active]:bg-primary/10 data-[state=active]:shadow-none dark:data-[state=active]:bg-primary/20"
          >
            <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 transition-colors group-data-[state=active]:bg-primary">
              <Table2 className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400 transition-colors group-data-[state=active]:text-white" />
            </div>
            <span className="whitespace-nowrap text-gray-600 dark:text-gray-400 transition-colors group-data-[state=active]:text-primary dark:group-data-[state=active]:text-primary font-medium">Tabla completa</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab resumen — vista compacta */}
        <TabsContent value="resumen">
          <div className="space-y-2">
            {filas.map((cierre) => (
              <div
                key={cierre.id}
                className="flex items-center justify-between py-2 px-3 rounded-md border border-gray-100 dark:border-gray-800 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {cierre.periodoEtiqueta}
                  </span>
                  <span className="text-xs text-gray-400">{cierre.fechaFormateada}</span>
                </div>
                <div className="flex items-center gap-2">
                  {onDownloadPDF && (
                    <button
                      onClick={() => {
                        const original = cierres.find((c) => c.id === cierre.id);
                        if (original) {
                          setDownloadingId(cierre.id);
                          onDownloadPDF(original);
                        }
                      }}
                      disabled={downloadingId === cierre.id}
                      className="inline-flex items-center justify-center h-7 w-7 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-40"
                      title="Descargar PDF"
                    >
                      {downloadingId === cierre.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileDown className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                  <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {cierre.estado}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Tab tabla completa — con paginación */}
        <TabsContent value="tabla">
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <th className="px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wider text-left">
                      Fecha
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wider text-left">
                      Tipo
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wider text-left">
                      Período
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wider text-right">
                      Reportes
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wider text-left">
                      Ejecutado por
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wider text-center">
                      Estado
                    </th>
                    {onDownloadPDF && (
                      <th className="px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wider text-center">
                        PDF
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {visibleRows.map((cierre, idx) => (
                    <tr
                      key={cierre.id}
                      className={`transition-colors ${
                        idx % 2 === 0
                          ? 'bg-white dark:bg-gray-900'
                          : 'bg-gray-50/50 dark:bg-gray-800/30'
                      } hover:bg-blue-50/50 dark:hover:bg-blue-900/10`}
                    >
                      <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {cierre.fechaFormateada}
                      </td>
                      <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300">
                        {cierre.tipo}
                      </td>
                      <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300">
                        {cierre.periodoEtiqueta}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                        {cierre.totalReportes}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 text-xs">
                        {cierre.ejecutadoPor}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                          <CheckCircle2 className="h-3 w-3" />
                          {cierre.estado}
                        </span>
                      </td>
                      {onDownloadPDF && (
                        <td className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => {
                              const original = cierres.find((c) => c.id === cierre.id);
                              if (original) {
                                setDownloadingId(cierre.id);
                                onDownloadPDF(original);
                              }
                            }}
                            disabled={downloadingId === cierre.id}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-40"
                            title="Descargar PDF"
                          >
                            {downloadingId === cierre.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <FileDown className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ReportePagination
              page={page}
              pageSize={pageSize}
              total={filas.length}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(0);
              }}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
