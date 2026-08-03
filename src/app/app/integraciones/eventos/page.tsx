'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import {
  integrationsService,
  IntegrationConnection,
  IntegrationEvent,
} from '@/lib/services/integrationsService';
import {
  EventsHeader,
  EventsFilters,
  EventsList,
  EventsPagination,
} from '@/components/integraciones/eventos';

export default function EventosPage() {
  const { organization } = useOrganization();
  const { toast } = useToast();

  // Estados principales
  const [events, setEvents] = useState<IntegrationEvent[]>([]);
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalEvents, setTotalEvents] = useState(0);

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Filtros
  const [filters, setFilters] = useState({
    connectionId: 'all',
    status: 'all',
    source: 'all',
    direction: 'all',
    eventType: 'all',
    dateFrom: '',
    dateTo: '',
  });

  // Cargar datos
  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    try {
      const offset = (currentPage - 1) * pageSize;

      // Preparar filtros para la API
      const apiFilters: any = {};
      if (filters.connectionId !== 'all') apiFilters.connectionId = filters.connectionId;
      if (filters.status !== 'all') apiFilters.status = filters.status;
      if (filters.source !== 'all') apiFilters.source = filters.source;
      if (filters.direction !== 'all') apiFilters.direction = filters.direction;
      if (filters.eventType !== 'all') apiFilters.eventType = filters.eventType;
      if (filters.dateFrom) apiFilters.dateFrom = filters.dateFrom;
      if (filters.dateTo) apiFilters.dateTo = filters.dateTo;

      const [eventsResult, connectionsData, eventTypesData] = await Promise.all([
        integrationsService.getEvents(organization.id, apiFilters, pageSize, offset),
        integrationsService.getConnections(organization.id),
        integrationsService.getEventTypes(organization.id),
      ]);

      setEvents(eventsResult.data);
      setTotalEvents(eventsResult.total);
      setConnections(connectionsData);
      setEventTypes(eventTypesData);
    } catch (error) {
      console.error('Error loading events:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron cargar los eventos',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organization?.id, currentPage, pageSize, filters, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handlers
  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1); // Reset a primera página al cambiar filtros
  };

  const handleClearFilters = () => {
    setFilters({
      connectionId: 'all',
      status: 'all',
      source: 'all',
      direction: 'all',
      eventType: 'all',
      dateFrom: '',
      dateTo: '',
    });
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const handleReprocess = async (event: IntegrationEvent) => {
    const result = await integrationsService.reprocessEvent(event.id);

    if (result.success) {
      toast({
        title: 'Evento encolado',
        description: result.message,
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: result.message,
      });
    }
  };

  const handleCopyId = (event: IntegrationEvent) => {
    navigator.clipboard.writeText(event.id);
    toast({
      title: 'Copiado',
      description: 'ID del evento copiado al portapapeles',
    });
  };

  const handleExport = async (format: 'json' | 'csv') => {
    if (!organization?.id) return;

    try {
      const apiFilters: any = {};
      if (filters.connectionId !== 'all') apiFilters.connectionId = filters.connectionId;
      if (filters.status !== 'all') apiFilters.status = filters.status;
      if (filters.dateFrom) apiFilters.dateFrom = filters.dateFrom;
      if (filters.dateTo) apiFilters.dateTo = filters.dateTo;

      const content = await integrationsService.exportEvents(organization.id, apiFilters, format);

      const blob = new Blob([content], {
        type: format === 'json' ? 'application/json' : 'text/csv',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `eventos-${new Date().toISOString().split('T')[0]}.${format}`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: 'Exportación completada',
        description: `Eventos exportados en formato ${format.toUpperCase()}`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron exportar los eventos',
      });
    }
  };

  // Calcular estadísticas
  const processedCount = events.filter((e) => e.status === 'processed').length;
  const errorCount = events.filter((e) => e.status === 'error').length;
  const totalPages = Math.ceil(totalEvents / pageSize);

  // Skeleton de carga
  if (loading) {
    return (
      <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950">
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-6">
          <div className="animate-pulse space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-xl" />
              <div className="space-y-2">
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-64" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 p-6">
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 animate-pulse"
              >
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <EventsHeader
        totalEvents={totalEvents}
        processedCount={processedCount}
        errorCount={errorCount}
        onRefresh={handleRefresh}
        onExport={handleExport}
        refreshing={refreshing}
      />

      {/* Filtros */}
      <EventsFilters
        connections={connections}
        eventTypes={eventTypes}
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
      />

      {/* Lista de eventos */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <EventsList
            events={events}
            loading={refreshing}
            onReprocess={handleReprocess}
            onCopyId={handleCopyId}
          />
        </div>
      </div>

      {/* Paginación */}
      {totalEvents > 0 && (
        <EventsPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalEvents}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}
    </div>
  );
}
