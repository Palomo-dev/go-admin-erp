'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, ListChecks, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { PrintJobsService, type PrintJobWithPrinter } from '@/lib/services/printJobsService';
import { supabase } from '@/lib/supabase/config';

interface RecentPrintJobsTableProps {
  branchId: number | null;
}

const STATUS_LABELS: Record<PrintJobWithPrinter['status'], string> = {
  pending: 'Pendiente',
  sent: 'Enviado',
  printed: 'Impreso',
  error: 'Error',
};

const STATUS_CLASSES: Record<PrintJobWithPrinter['status'], string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  printed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const JOB_TYPE_LABELS: Record<PrintJobWithPrinter['job_type'], string> = {
  kitchen_ticket: 'Comanda',
  pre_cuenta: 'Pre-cuenta',
  sale_ticket: 'Venta',
};

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export function RecentPrintJobsTable({ branchId }: RecentPrintJobsTableProps) {
  const [jobs, setJobs] = useState<PrintJobWithPrinter[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const loadJobs = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const { jobs: data, total } = await PrintJobsService.getJobsPaginated(branchId, currentPage, pageSize);
      setJobs(data);
      setTotalItems(total);
    } catch (error) {
      console.error('Error obteniendo trabajos de impresión:', error);
    } finally {
      setLoading(false);
    }
  }, [branchId, currentPage, pageSize]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Reset a página 1 cuando cambia pageSize
  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize]);

  // Ajustar página si el total cambia y la página actual queda fuera de rango
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  // Actualización en vivo: se refresca cuando cambia cualquier print_job de la sucursal
  useEffect(() => {
    if (!branchId) return;

    const channel = supabase
      .channel(`print_jobs-config-${branchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'print_jobs', filter: `branch_id=eq.${branchId}` },
        () => loadJobs()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [branchId, loadJobs]);

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-slate-600" />
            Trabajos de Impresión Recientes
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Historial completo de trabajos enviados al Print Agent de esta sucursal
          </CardDescription>
        </div>
        <Button variant="outline" size="icon" onClick={loadJobs} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4 text-sm">
            Aún no se ha encolado ningún trabajo de impresión
          </p>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Fecha</th>
                    <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Tipo</th>
                    <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Impresora</th>
                    <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Estación</th>
                    <th className="text-center py-2 px-3 text-gray-600 dark:text-gray-400">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {new Date(job.created_at).toLocaleString('es-CO')}
                      </td>
                      <td className="py-2 px-3 text-gray-900 dark:text-white">{JOB_TYPE_LABELS[job.job_type]}</td>
                      <td className="py-2 px-3 text-gray-900 dark:text-white">{job.printers?.name || '-'}</td>
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{job.station || '-'}</td>
                      <td className="py-2 px-3 text-center">
                        <Badge className={STATUS_CLASSES[job.status]} title={job.error_message || undefined}>
                          {STATUS_LABELS[job.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {totalItems > 0 && (
              <div className="flex items-center justify-between gap-4 flex-wrap pt-2 border-t border-gray-200 dark:border-gray-700">
                {/* Selector de tamaño de página */}
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <span>Mostrar</span>
                  <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                    <SelectTrigger className="w-[80px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span>por página</span>
                </div>

                {/* Info de registros */}
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {(() => {
                    const start = (currentPage - 1) * pageSize + 1;
                    const end = Math.min(currentPage * pageSize, totalItems);
                    return `Mostrando ${start} a ${end} de ${totalItems} trabajos`;
                  })()}
                </div>

                {/* Controles de navegación */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1 || loading}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1 || loading}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium px-2 min-w-[60px] text-center">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages || loading}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages || loading}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
