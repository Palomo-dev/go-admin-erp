'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, FileText, Download } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { useOrganization } from '@/lib/hooks/useOrganization';
import ChatAuditService, { AuditLog, AuditFilters, AuditStats } from '@/lib/services/chatAuditService';
import {
  AuditHeader,
  AuditFilters as AuditFiltersComponent,
  AuditLogCard,
  AuditDetailDialog,
} from '@/components/chat/auditoria';
import { ChatNavTabs } from '@/components/chat/ChatNavTabs';

export default function ChatAuditPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<AuditStats>({
    total: 0,
    today: 0,
    thisWeek: 0,
    byAction: {},
    byEntity: {},
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const [filters, setFilters] = useState<AuditFilters>({
    action: undefined,
    entityType: undefined,
    actorType: undefined,
    dateFrom: undefined,
    dateTo: undefined,
    search: '',
  });

  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    setIsLoading(true);
    try {
      const service = new ChatAuditService(organization.id);

      const [logsResult, statsData] = await Promise.all([
        service.getLogs(filters),
        service.getStats(),
      ]);

      setLogs(logsResult.logs);
      setStats(statsData);
    } catch (error) {
      console.error('Error cargando logs de auditoría:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los logs de auditoría',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, filters, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExport = async () => {
    if (!organization?.id) return;

    setIsExporting(true);
    try {
      const service = new ChatAuditService(organization.id);
      const logsData = await service.exportLogs(filters);

      const headers = ['ID', 'Fecha', 'Acción', 'Entidad', 'Actor', 'IP', 'Cambios'];
      const rows = logsData.map(log => [
        log.id,
        new Date(log.created_at).toLocaleString('es-CO'),
        service.getActionLabel(log.action),
        service.getEntityLabel(log.entity_type),
        service.getActorLabel(log.actor_type),
        log.ip_address || '',
        log.changes ? JSON.stringify(log.changes) : ''
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: 'Exportación exitosa',
        description: `Se exportaron ${logsData.length} registros correctamente`,
      });
    } catch (error) {
      console.error('Error exportando logs:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron exportar los logs de auditoría',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleViewDetails = (log: AuditLog) => {
    setSelectedLog(log);
    setIsDetailOpen(true);
  };

  const handleFiltersChange = (newFilters: AuditFilters) => {
    setFilters(newFilters);
  };

  const handleClearFilters = () => {
    setFilters({
      action: undefined,
      entityType: undefined,
      actorType: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      search: '',
    });
  };

  if (isLoading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-gray-500 dark:text-gray-400">Cargando auditoría...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <ChatNavTabs />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <AuditHeader
        stats={stats}
        loading={isLoading}
        onRefresh={loadData}
        onExport={handleExport}
      />

      <AuditFiltersComponent
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onClearFilters={handleClearFilters}
      />

      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-gray-100 dark:bg-gray-800 p-4 mb-4">
            <FileText className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            No hay registros de auditoría
          </h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-md">
            No se encontraron registros de auditoría con los filtros actuales.
            Prueba a cambiar los filtros o espera a que se generen nuevas acciones.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {logs.map((log) => (
              <AuditLogCard
                key={log.id}
                log={log}
                onViewDetails={handleViewDetails}
              />
            ))}
          </div>

          {logs.length > 0 && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={handleExport}
                disabled={isExporting}
                className="gap-2"
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Exportar resultados
              </Button>
            </div>
          )}
        </>
      )}

      <AuditDetailDialog
        log={selectedLog}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
      />
      </div>
    </div>
  );
}
