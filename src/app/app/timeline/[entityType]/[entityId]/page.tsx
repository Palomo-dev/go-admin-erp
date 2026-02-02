'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { subDays, startOfDay, endOfDay } from 'date-fns';

import { getOrganizationId } from '@/lib/hooks/useOrganization';
import timelineService, { 
  type TimelineEvent,
  type TimelineFilters as ITimelineFilters,
} from '@/lib/services/timelineService';

import { TimelineEventList } from '@/components/timeline';
import {
  EntityTimelineHeader,
  EntityTimelineFilters,
  EntityTimelineTabs,
  EntityInfo,
  type EntityFilters,
} from '@/components/timeline/entidad';
import { 
  type EntityTabType,
  filterEventsByTab,
  countEventsByTab,
} from '@/components/timeline/entidad/EntityTimelineTabs';

export default function EntityTimelinePage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  
  const entityType = params.entityType as string;
  const entityId = params.entityId as string;
  const organizationId = getOrganizationId();

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [allEvents, setAllEvents] = useState<TimelineEvent[]>([]);
  const [entityData, setEntityData] = useState<Record<string, unknown> | null>(null);
  const [entityName, setEntityName] = useState<string | undefined>();
  const [loadingEntity, setLoadingEntity] = useState(true);
  
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  const [activeTab, setActiveTab] = useState<EntityTabType>('all');
  const [availableActions, setAvailableActions] = useState<string[]>([]);

  // Filtros con rango de fechas amplio por defecto (todo el historial)
  const defaultFilters: EntityFilters = {
    startDate: startOfDay(subDays(new Date(), 365 * 5)).toISOString(),
    endDate: endOfDay(new Date()).toISOString(),
  };

  const [filters, setFilters] = useState<EntityFilters>(defaultFilters);

  // Cargar información de la entidad
  const loadEntityData = useCallback(async () => {
    setLoadingEntity(true);
    try {
      // Mapeo de tipos de entidad a tablas de Supabase
      const entityTables: Record<string, string> = {
        product: 'products',
        products: 'products',
        customer: 'customers',
        customers: 'customers',
        invoice: 'invoice_sales',
        invoices: 'invoice_sales',
        sale: 'sales',
        sales: 'sales',
        conversation: 'conversations',
        conversations: 'conversations',
        trip: 'trips',
        trips: 'trips',
        shipment: 'shipments',
        shipments: 'shipments',
        employee: 'employees',
        employees: 'employees',
        role: 'roles',
        roles: 'roles',
        reservation: 'reservations',
        reservations: 'reservations',
        branch: 'branches',
        branches: 'branches',
      };

      const tableName = entityTables[entityType.toLowerCase()];
      if (!tableName) {
        setEntityData(null);
        return;
      }

      const { supabase } = await import('@/lib/supabase/config');
      const { data } = await supabase
        .from(tableName)
        .select('*')
        .eq('id', entityId)
        .single();

      if (data) {
        setEntityData(data);
        // Extraer nombre de la entidad
        const name = data.name || data.full_name || data.title || data.invoice_number || data.tracking_number;
        if (name) setEntityName(String(name));
      }
    } catch (err) {
      console.error('Error loading entity data:', err);
    } finally {
      setLoadingEntity(false);
    }
  }, [entityType, entityId]);

  // Cargar eventos del timeline para esta entidad
  const loadEvents = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
        setPage(1);
      } else {
        setLoading(true);
      }
      setError(null);

      // Construir filtros para la entidad específica
      const timelineFilters: ITimelineFilters = {
        startDate: filters.startDate,
        endDate: filters.endDate,
        entityType: entityType,
        entityId: entityId,
        action: filters.action,
        searchText: filters.searchText,
      };

      const result = await timelineService.getEvents(
        organizationId,
        timelineFilters,
        1,
        500 // Cargar más eventos para el historial de entidad
      );

      setAllEvents(result.data);
      setTotalCount(result.count);
      setHasMore(result.hasMore);

      // Extraer acciones disponibles
      const actions = new Set<string>();
      result.data.forEach(e => actions.add(e.action));
      setAvailableActions(Array.from(actions).sort());

    } catch (err) {
      console.error('Error loading events:', err);
      setError('No se pudieron cargar los eventos');
      toast({
        title: 'Error',
        description: 'No se pudo cargar el historial de la entidad',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId, entityType, entityId, filters, toast]);

  // Cargar más eventos
  const loadMore = useCallback(async () => {
    try {
      setLoadingMore(true);
      const nextPage = page + 1;
      
      const timelineFilters: ITimelineFilters = {
        startDate: filters.startDate,
        endDate: filters.endDate,
        entityType: entityType,
        entityId: entityId,
        action: filters.action,
        searchText: filters.searchText,
      };

      const result = await timelineService.getEvents(
        organizationId,
        timelineFilters,
        nextPage,
        100
      );
      
      setAllEvents(prev => [...prev, ...result.data]);
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
  }, [organizationId, entityType, entityId, filters, page, toast]);

  // Efectos
  useEffect(() => {
    loadEntityData();
  }, [loadEntityData]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Filtrar eventos por tab activo
  const filteredEvents = useMemo(() => {
    return filterEventsByTab(allEvents, activeTab);
  }, [allEvents, activeTab]);

  // Contar eventos por categoría
  const tabCounts = useMemo(() => {
    return countEventsByTab(allEvents);
  }, [allEvents]);

  // Determinar si mostrar tab de integraciones
  const showIntegrations = useMemo(() => {
    return tabCounts.integrations > 0 || 
           ['invoice', 'invoices', 'sale', 'sales'].includes(entityType.toLowerCase());
  }, [tabCounts.integrations, entityType]);

  // Handlers
  const handleBack = () => {
    router.push('/app/timeline');
  };

  const handleRefresh = () => {
    loadEvents(true);
  };

  const handleFiltersChange = (newFilters: EntityFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handleViewDetail = (event: TimelineEvent) => {
    router.push(`/app/timeline/eventos/${event.event_id}`);
  };

  const handleViewCorrelation = (correlationId: string) => {
    router.push(`/app/timeline?correlationId=${correlationId}`);
  };

  const handleNavigateToEntity = () => {
    const entityRoutes: Record<string, string> = {
      product: `/app/inventario/productos/${entityId}`,
      products: `/app/inventario/productos/${entityId}`,
      customer: `/app/crm/clientes/${entityId}`,
      customers: `/app/crm/clientes/${entityId}`,
      invoice: `/app/finanzas/facturas/${entityId}`,
      invoices: `/app/finanzas/facturas/${entityId}`,
      sale: `/app/pos/ventas/${entityId}`,
      sales: `/app/pos/ventas/${entityId}`,
      trip: `/app/transporte/viajes/${entityId}`,
      trips: `/app/transporte/viajes/${entityId}`,
      shipment: `/app/transporte/envios/${entityId}`,
      shipments: `/app/transporte/envios/${entityId}`,
      conversation: `/app/inbox/${entityId}`,
      conversations: `/app/inbox/${entityId}`,
      employee: `/app/hrm/empleados/${entityId}`,
      employees: `/app/hrm/empleados/${entityId}`,
      membership: `/app/pms/memberships/${entityId}`,
      memberships: `/app/pms/memberships/${entityId}`,
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

  const handleExport = async () => {
    try {
      const blob = new Blob([JSON.stringify(filteredEvents, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `historial-${entityType}-${entityId.substring(0, 8)}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Exportación exitosa',
        description: `Se exportaron ${filteredEvents.length} eventos`,
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'No se pudo exportar el historial',
        variant: 'destructive',
      });
    }
  };

  // Loading state
  if (loading && allEvents.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 lg:px-8 py-6">
          <Skeleton className="h-8 w-32 mb-4" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
        </div>
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-10 w-full" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && allEvents.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Error al cargar el historial
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            {error}
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={handleBack}>
              Volver al Timeline
            </Button>
            <Button onClick={() => loadEvents()}>
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
      <EntityTimelineHeader
        entityType={entityType}
        entityId={entityId}
        entityName={entityName}
        totalEvents={totalCount}
        onBack={handleBack}
        onNavigateToEntity={handleNavigateToEntity}
      />

      {/* Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar con info de entidad */}
          <div className="lg:col-span-1 space-y-4">
            <EntityInfo
              entityType={entityType}
              entityId={entityId}
              entityData={entityData}
              loading={loadingEntity}
            />

            {/* Acciones */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
              <Button
                onClick={handleRefresh}
                disabled={refreshing}
                variant="outline"
                className="w-full border-gray-300 dark:border-gray-600"
              >
                <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
                Actualizar
              </Button>
              <Button
                onClick={handleExport}
                disabled={filteredEvents.length === 0}
                variant="outline"
                className="w-full border-gray-300 dark:border-gray-600"
              >
                <FileJson className="h-4 w-4 mr-2" />
                Exportar JSON
              </Button>
            </div>
          </div>

          {/* Lista de eventos */}
          <div className="lg:col-span-3 space-y-4">
            {/* Tabs */}
            <EntityTimelineTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
              counts={tabCounts}
              showIntegrations={showIntegrations}
            />

            {/* Filtros */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <EntityTimelineFilters
                filters={filters}
                onFiltersChange={handleFiltersChange}
                availableActions={availableActions}
              />
            </div>

            {/* Lista de eventos */}
            <TimelineEventList
              events={filteredEvents}
              loading={loading || loadingMore}
              hasMore={hasMore && activeTab === 'all'}
              totalCount={filteredEvents.length}
              onLoadMore={loadMore}
              onViewDetail={handleViewDetail}
              onViewCorrelation={handleViewCorrelation}
              onNavigateToEntity={handleNavigateToEntity}
              error={error}
              onRetry={handleRefresh}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
