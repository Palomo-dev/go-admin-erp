'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import {
  Database, RefreshCw, ArrowLeft, Download,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';

import {
  executionReportService,
  ReportExecution,
  ExecutionFilters,
  ExecutionStats,
  ExecutionFiltersComponent,
  ExecutionStatsComponent,
  ExecutionTable,
  ExecutionDetailDialog,
} from '@/components/reportes/ejecuciones';

function getDefaultFilters(): ExecutionFilters {
  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(today.getDate() - 30);
  return {
    status: 'all',
    module: 'all',
    dateFrom: monthAgo.toISOString().split('T')[0],
    dateTo: today.toISOString().split('T')[0],
    search: '',
  };
}

export default function ReportesEjecucionesPage() {
  const { organization } = useOrganization();
  const { toast } = useToast();

  // Datos
  const [executions, setExecutions] = useState<ReportExecution[]>([]);
  const [stats, setStats] = useState<ExecutionStats | null>(null);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filtros y paginación
  const [filters, setFilters] = useState<ExecutionFilters>(getDefaultFilters());
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Dialog detalle
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState<ReportExecution | null>(null);

  // ─── Carga de datos ────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!organization?.id) return;
    setIsLoading(true);
    try {
      const [execData, statsData] = await Promise.all([
        executionReportService.getExecutions(organization.id, filters, page, pageSize),
        executionReportService.getStats(organization.id, filters),
      ]);
      setExecutions(execData.data);
      setTotal(execData.total);
      setStats(statsData);
    } catch (error) {
      console.error('Error cargando ejecuciones:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar los datos', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, filters, page, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Reset page cuando cambian filtros
  useEffect(() => { setPage(1); }, [filters]);

  // ─── Acciones ──────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
    toast({ title: 'Actualizado', description: 'Datos actualizados correctamente' });
  };

  const handleReExecute = async (item: ReportExecution) => {
    if (!organization?.id) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');
      const result = await executionReportService.reExecute(organization.id, user.id, item);
      if (result) {
        toast({ title: 'Re-ejecutado', description: 'Ejecución duplicada con los mismos parámetros' });
        await loadData();
      }
    } catch {
      toast({ title: 'Error', description: 'No se pudo re-ejecutar', variant: 'destructive' });
    }
  };

  const handleDelete = async (item: ReportExecution) => {
    const ok = await executionReportService.delete(item.id);
    if (ok) {
      toast({ title: 'Eliminado', description: 'Registro de ejecución eliminado' });
      await loadData();
    } else {
      toast({ title: 'Error', description: 'No se pudo eliminar', variant: 'destructive' });
    }
  };

  const handleViewDetails = (item: ReportExecution) => {
    setSelectedExecution(item);
    setDetailOpen(true);
  };

  const handleExportCSV = () => {
    if (executions.length === 0) {
      toast({ title: 'Sin datos', description: 'No hay datos para exportar', variant: 'destructive' });
      return;
    }
    const headers = ['Fecha', 'Reporte', 'Módulo', 'Estado', 'Filas', 'Duración (ms)', 'Usuario', 'Error'];
    const rows = executions.map((e) => [
      new Date(e.created_at).toISOString(),
      e.saved_report_name || 'Manual',
      e.module,
      e.status,
      e.row_count,
      e.duration_ms,
      e.user_name || '',
      e.error_message || '',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${v}"`).join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ejecuciones-${filters.dateFrom}-${filters.dateTo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exportado', description: 'Archivo CSV descargado' });
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  if (!organization) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Cargando organización...</div>
      </div>
    );
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <div className="px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link href="/app/reportes" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <ArrowLeft className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </Link>
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Database className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Historial de Ejecuciones</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {total} ejecución{total !== 1 ? 'es' : ''} registrada{total !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV} className="border-gray-300 dark:border-gray-700">
                <Download className="h-4 w-4 mr-2" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing} className="border-gray-300 dark:border-gray-700">
                <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} /> Actualizar
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 sm:p-6 space-y-4">
          {/* KPIs */}
          <ExecutionStatsComponent data={stats} isLoading={isLoading} />

          {/* Filtros */}
          <ExecutionFiltersComponent
            search={filters.search}
            onSearchChange={(v) => setFilters((p) => ({ ...p, search: v }))}
            statusFilter={filters.status}
            onStatusChange={(v) => setFilters((p) => ({ ...p, status: v }))}
            moduleFilter={filters.module}
            onModuleChange={(v) => setFilters((p) => ({ ...p, module: v }))}
            dateFrom={filters.dateFrom}
            onDateFromChange={(v) => setFilters((p) => ({ ...p, dateFrom: v }))}
            dateTo={filters.dateTo}
            onDateToChange={(v) => setFilters((p) => ({ ...p, dateTo: v }))}
          />

          {/* Tabla */}
          <ExecutionTable
            data={executions}
            isLoading={isLoading}
            onReExecute={handleReExecute}
            onDelete={handleDelete}
            onViewDetails={handleViewDetails}
          />

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between py-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Página {page} de {totalPages} · {total} registros
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="border-gray-300 dark:border-gray-700"
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="border-gray-300 dark:border-gray-700"
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialog Detalle */}
      <ExecutionDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        execution={selectedExecution}
      />
    </div>
  );
}
