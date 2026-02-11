'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, FileText } from 'lucide-react';
import {
  LogsHeader,
  LogFilters,
  LogTable,
  LogDetailSheet,
  LogsService,
} from '@/components/notificaciones/logs';
import type {
  DeliveryLog,
  LogFilters as LogFiltersType,
  LogStats,
} from '@/components/notificaciones/logs/types';
import { DEFAULT_LOG_FILTERS } from '@/components/notificaciones/logs/types';

export default function LogsPage() {
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [logs, setLogs] = useState<DeliveryLog[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [filters, setFilters] = useState<LogFiltersType>(DEFAULT_LOG_FILTERS);
  const [page, setPage] = useState(1);
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [availableChannels, setAvailableChannels] = useState<string[]>([]);

  const [selectedLog, setSelectedLog] = useState<DeliveryLog | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!organizationId) return;

    try {
      const [logsResult, statsData, providers, channels] = await Promise.all([
        LogsService.getLogs(organizationId, filters, page),
        LogsService.getStats(organizationId),
        LogsService.getDistinctProviders(organizationId),
        LogsService.getDistinctChannels(organizationId),
      ]);

      setLogs(logsResult.data);
      setTotal(logsResult.total);
      setStats(statsData);
      setAvailableProviders(providers);
      setAvailableChannels(channels);
    } catch (error) {
      console.error('Error cargando logs:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar los logs.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, filters, page, toast]);

  useEffect(() => {
    if (organizationId) {
      setIsLoading(true);
      loadData();
    }
  }, [organizationId, loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const handleRetry = async (log: DeliveryLog) => {
    const ok = await LogsService.retryDelivery(log);
    if (ok) {
      toast({ title: 'Reintento creado', description: `Intento #${log.attempt_no + 1} programado.` });
      setTimeout(() => loadData(), 1500);
    } else {
      toast({ title: 'Error', description: 'No se pudo reintentar.', variant: 'destructive' });
    }
  };

  const handleExport = () => {
    const csv = LogsService.exportToCSV(logs);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `delivery-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exportado', description: `${logs.length} registros exportados a CSV.` });
  };

  const handleFiltersChange = (newFilters: LogFiltersType) => {
    setFilters(newFilters);
    setPage(1);
  };

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Cargando logs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <LogsHeader
        stats={stats}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
        onExport={handleExport}
      />

      <LogFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        availableProviders={availableProviders}
        availableChannels={availableChannels}
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
          <LogTable
            logs={logs}
            total={total}
            page={page}
            onPageChange={setPage}
            onViewDetail={(log) => { setSelectedLog(log); setDetailOpen(true); }}
            onRetry={handleRetry}
            isLoading={isLoading}
          />
        </div>
      </div>

      <LogDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        log={selectedLog}
        onRetry={handleRetry}
      />
    </div>
  );
}
