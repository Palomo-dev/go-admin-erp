'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import {
  RefreshCw,
  History,
  Activity,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { subDays, startOfDay, endOfDay } from 'date-fns';

import { getOrganizationId } from '@/lib/hooks/useOrganization';
import timelineService, {
  type TimelineEvent,
  type TimelineFilters as ITimelineFilters,
  type TimelineStats,
} from '@/lib/services/timelineService';

import {
  TimelineStatsCards,
  TimelineFilters,
  TimelineEventList,
  TimelineExportButton,
} from '@/components/timeline';

export default function TimelinePage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [stats, setStats] = useState<TimelineStats | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [availableEntityTypes, setAvailableEntityTypes] = useState<string[]>([]);
  
  // Estados removidos: selectedEvent y detailOpen ya no son necesarios
  // porque ahora navegamos a /app/timeline/eventos/[id]

  const organizationId = getOrganizationId();

  const defaultFilters: ITimelineFilters = {
    startDate: startOfDay(subDays(new Date(), 7)).toISOString(),
    endDate: endOfDay(new Date()).toISOString(),
  };

  const [filters, setFilters] = useState<ITimelineFilters>(defaultFilters);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
        setPage(1);
      } else {
        setLoading(true);
      }
      setError(null);

      const [eventsResult, statsResult, tables, actions, entityTypes] = await Promise.all([
        timelineService.getEvents(organizationId, filters, 1, 50),
        timelineService.getStats(organizationId, filters.startDate, filters.endDate),
        timelineService.getAvailableSourceTables(organizationId),
        timelineService.getAvailableActions(organizationId),
        timelineService.getAvailableEntityTypes(organizationId),
      ]);

      setEvents(eventsResult.data);
      setTotalCount(eventsResult.count);
      setHasMore(eventsResult.hasMore);
      setStats(statsResult);
      setAvailableTables(tables);
      setAvailableActions(actions);
      setAvailableEntityTypes(entityTypes);
    } catch (err) {
      console.error('Error loading timeline data:', err);
      setError('No se pudieron cargar los datos del timeline');
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos del timeline',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId, filters, toast]);

  const loadMore = useCallback(async () => {
    try {
      setLoadingMore(true);
      const nextPage = page + 1;
      const result = await timelineService.getEvents(organizationId, filters, nextPage, 50);
      
      setEvents(prev => [...prev, ...result.data]);
      setHasMore(result.hasMore);
      setPage(nextPage);
    } catch (err) {
      console.error('Error loading more events:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar más eventos',
        variant: 'destructive',
      });
    } finally {
      setLoadingMore(false);
    }
  }, [organizationId, filters, page, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    loadData(true);
  };

  const handleFiltersChange = (newFilters: ITimelineFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handleViewDetail = (event: TimelineEvent) => {
    // Navegar a la página de detalle del evento
    router.push(`/app/timeline/eventos/${event.event_id}`);
  };

  const handleViewCorrelation = (correlationId: string) => {
    setFilters(prev => ({
      ...prev,
      correlationId,
    }));
  };

  const handleNavigateToEntity = (entityType: string, entityId: string) => {
    const entityRoutes: Record<string, string> = {
      product: `/app/inventario/productos/${entityId}`,
      customer: `/app/crm/clientes/${entityId}`,
      invoice: `/app/finanzas/facturas/${entityId}`,
      trip: `/app/transporte/viajes/${entityId}`,
      shipment: `/app/transporte/envios/${entityId}`,
      conversation: `/app/inbox/${entityId}`,
      integration: `/app/integraciones/conexiones/${entityId}`,
      employee: `/app/hrm/empleados/${entityId}`,
      membership: `/app/pms/memberships/${entityId}`,
    };

    const route = entityRoutes[entityType];
    if (route) {
      router.push(route);
    } else {
      toast({
        title: 'Navegación no disponible',
        description: `No hay ruta configurada para ${entityType}`,
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <History className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  Timeline
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Auditoría unificada del sistema
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
              <TimelineExportButton
                organizationId={organizationId}
                filters={filters}
                disabled={loading || events.length === 0}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Stats Cards */}
        <TimelineStatsCards stats={stats} loading={loading && !refreshing} />

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <TimelineFilters
            filters={filters}
            onFiltersChange={handleFiltersChange}
            availableTables={availableTables}
            availableActions={availableActions}
            availableEntityTypes={availableEntityTypes}
            loading={loading}
          />
        </div>

        {/* Event List */}
        <TimelineEventList
          events={events}
          loading={loading || loadingMore}
          hasMore={hasMore}
          totalCount={totalCount}
          onLoadMore={loadMore}
          onViewDetail={handleViewDetail}
          onViewCorrelation={handleViewCorrelation}
          onNavigateToEntity={handleNavigateToEntity}
          error={error}
          onRetry={handleRefresh}
        />
      </div>
    </div>
  );
}
