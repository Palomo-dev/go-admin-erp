'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import {
  RefreshCw,
  Download,
  Plus,
  Link2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { getOrganizationId } from '@/lib/hooks/useOrganization';
import integrationsService, {
  type IntegrationStats,
  type IntegrationConnection,
  type IntegrationEvent,
  type TopProblem,
} from '@/lib/services/integrationsService';

import {
  StatsCards,
  TopProblems,
  QuickActions,
  RecentConnections,
  RecentEvents,
  ChatChannelsSection,
} from '@/components/integraciones';

export default function IntegracionesPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<IntegrationStats | null>(null);
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [events, setEvents] = useState<IntegrationEvent[]>([]);
  const [topProblems, setTopProblems] = useState<TopProblem[]>([]);

  const organizationId = getOrganizationId();

  const loadData = useCallback(async () => {
    try {
      const [statsData, connectionsData, eventsData, problemsData] = await Promise.all([
        integrationsService.getStats(organizationId),
        integrationsService.getConnections(organizationId),
        integrationsService.getRecentEvents(organizationId, 10),
        integrationsService.getTopProblems(organizationId, 5),
      ]);

      setStats(statsData);
      setConnections(connectionsData);
      setEvents(eventsData);
      setTopProblems(problemsData);
    } catch (error) {
      console.error('Error loading integrations data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos de integraciones',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleExport = async () => {
    try {
      const data = await integrationsService.exportState(organizationId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `integraciones-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Exportación exitosa',
        description: 'El archivo se descargó correctamente',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'No se pudo exportar el estado',
        variant: 'destructive',
      });
    }
  };

  const handleViewConnection = (connectionId: string) => {
    router.push(`/app/integraciones/conexiones/${connectionId}`);
  };

  const handleRetryFailed = async () => {
    // Obtener jobs fallidos y reintentarlos
    const jobs = await integrationsService.getRecentJobs(organizationId, 50);
    const failedJobs = jobs.filter(j => j.status === 'failed');
    
    if (failedJobs.length === 0) {
      toast({
        title: 'Sin jobs fallidos',
        description: 'No hay jobs fallidos para reintentar',
      });
      return;
    }

    let retried = 0;
    for (const job of failedJobs) {
      const success = await integrationsService.retryJob(job.id);
      if (success) retried++;
    }

    toast({
      title: 'Jobs reintentados',
      description: `Se reintentaron ${retried} de ${failedJobs.length} jobs`,
    });

    handleRefresh();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Link2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  Integraciones
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Dashboard de conexiones y sincronización
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="border-gray-300 dark:border-gray-600"
              >
                <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
                Actualizar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                className="border-gray-300 dark:border-gray-600"
              >
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </Button>
              <Link href="/app/integraciones/conexiones/nueva">
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Conexión
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* KPIs */}
        <StatsCards stats={stats} loading={loading} />

        {/* Grid principal */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna izquierda - 2/3 */}
          <div className="lg:col-span-2 space-y-6">
            {/* Conexiones recientes */}
            <RecentConnections
              connections={connections}
              loading={loading}
              onViewConnection={handleViewConnection}
            />

            {/* Eventos recientes */}
            <RecentEvents events={events} loading={loading} />

            {/* Canales de Chat */}
            <ChatChannelsSection organizationId={organizationId} />
          </div>

          {/* Columna derecha - 1/3 */}
          <div className="space-y-6">
            {/* Acciones rápidas */}
            <QuickActions
              onExport={handleExport}
              onRetryFailed={handleRetryFailed}
            />

            {/* Top problemas */}
            <TopProblems
              problems={topProblems}
              loading={loading}
              onViewConnection={handleViewConnection}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
