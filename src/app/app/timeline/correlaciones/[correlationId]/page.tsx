'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import {
  AlertCircle,
  RefreshCw,
  Download,
  FileJson,
} from 'lucide-react';

import { getOrganizationId } from '@/lib/hooks/useOrganization';
import timelineService, { type TimelineEvent } from '@/lib/services/timelineService';

import {
  CorrelationHeader,
  CorrelationTimeline,
  CorrelationSummary,
} from '@/components/timeline/correlaciones';

export default function CorrelationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  
  const correlationId = params.correlationId as string;
  const organizationId = getOrganizationId();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);

  // Cargar eventos correlacionados
  const loadCorrelatedEvents = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const data = await timelineService.getCorrelatedEvents(
        organizationId,
        correlationId
      );

      if (data.length === 0) {
        setError('No se encontraron eventos con este correlation_id');
        return;
      }

      setEvents(data);
    } catch (err) {
      console.error('Error loading correlated events:', err);
      setError('No se pudieron cargar los eventos');
      toast({
        title: 'Error',
        description: 'No se pudo cargar la traza de correlación',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId, correlationId, toast]);

  useEffect(() => {
    loadCorrelatedEvents();
  }, [loadCorrelatedEvents]);

  // Handlers
  const handleBack = () => {
    router.push('/app/timeline');
  };

  const handleRefresh = () => {
    loadCorrelatedEvents(true);
  };

  const handleViewDetail = (event: TimelineEvent) => {
    router.push(`/app/timeline/eventos/${event.event_id}`);
  };

  const handleNavigateToEntity = (entityType: string, entityId: string) => {
    const entityRoutes: Record<string, string> = {
      product: `/app/inventario/productos/${entityId}`,
      customer: `/app/crm/clientes/${entityId}`,
      invoice: `/app/finanzas/facturas/${entityId}`,
      sale: `/app/pos/ventas/${entityId}`,
      trip: `/app/transporte/viajes/${entityId}`,
      shipment: `/app/transporte/envios/${entityId}`,
      conversation: `/app/inbox/${entityId}`,
      employee: `/app/hrm/empleados/${entityId}`,
      membership: `/app/pms/memberships/${entityId}`,
      payment: `/app/finanzas/pagos/${entityId}`,
    };

    const route = entityRoutes[entityType.toLowerCase()];
    if (route) {
      router.push(route);
    } else {
      toast({
        title: 'Navegación no disponible',
        description: `No hay ruta configurada para ${entityType}`,
      });
    }
  };

  const handleShare = () => {
    const url = `${window.location.origin}/app/timeline/correlaciones/${correlationId}`;
    navigator.clipboard.writeText(url);
    toast({
      title: 'Enlace copiado',
      description: 'El enlace ha sido copiado al portapapeles',
    });
  };

  const handleExport = () => {
    try {
      const exportData = {
        correlationId,
        exportedAt: new Date().toISOString(),
        totalEvents: events.length,
        events: events.map(e => ({
          ...e,
          // Ordenar campos para mejor legibilidad
        })),
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `traza-${correlationId.substring(0, 8)}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Exportación exitosa',
        description: `Se exportaron ${events.length} eventos`,
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'No se pudo exportar la traza',
        variant: 'destructive',
      });
    }
  };

  // Obtener timestamps extremos
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
  );
  const firstEventTime = sortedEvents[0]?.event_time;
  const lastEventTime = sortedEvents[sortedEvents.length - 1]?.event_time;

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 lg:px-8 py-6">
          <Skeleton className="h-8 w-32 mb-4" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-96" />
            </div>
          </div>
        </div>
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  {i < 3 && <Skeleton className="w-0.5 flex-1 min-h-[60px]" />}
                </div>
                <Skeleton className="flex-1 h-32 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && events.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Correlación no encontrada
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-2">
            {error}
          </p>
          <p className="text-xs font-mono text-gray-400 dark:text-gray-500 mb-6 break-all">
            {correlationId}
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={handleBack}>
              Volver al Timeline
            </Button>
            <Button onClick={() => loadCorrelatedEvents()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Reintentar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <CorrelationHeader
        correlationId={correlationId}
        totalEvents={events.length}
        firstEventTime={firstEventTime}
        lastEventTime={lastEventTime}
        onBack={handleBack}
        onShare={handleShare}
      />

      {/* Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        {/* Acciones */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Traza de la Operación
          </h2>
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
              <FileJson className="h-4 w-4 mr-2" />
              Exportar JSON
            </Button>
          </div>
        </div>

        {/* Resumen */}
        <div className="mb-8">
          <CorrelationSummary events={events} />
        </div>

        {/* Timeline visual */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-6">
            Secuencia de Eventos
          </h3>
          <CorrelationTimeline
            events={events}
            loading={loading || refreshing}
            onViewDetail={handleViewDetail}
            onNavigateToEntity={handleNavigateToEntity}
          />
        </div>
      </div>
    </div>
  );
}
