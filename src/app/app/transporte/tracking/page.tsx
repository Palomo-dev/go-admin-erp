'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, AlertTriangle, Loader2 } from 'lucide-react';
import {
  TrackingHeader,
  TrackingFilters,
  TrackingFeed,
  RegisterEventDialog,
  StoppedItemsPanel,
} from '@/components/transporte/tracking';
import { trackingService, type TrackingEvent, type TrackingStats } from '@/lib/services/trackingService';

interface Filters {
  reference_type: 'trip' | 'shipment' | 'all';
  dateFrom: string;
  dateTo: string;
  search: string;
}

export default function TrackingPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [stats, setStats] = useState<TrackingStats>({
    totalEvents: 0,
    tripEvents: 0,
    shipmentEvents: 0,
    todayEvents: 0,
    stoppedItems: 0,
  });
  const [stoppedItems, setStoppedItems] = useState<Array<{
    type: 'trip' | 'shipment';
    id: string;
    code: string;
    status: string;
    stoppedSince?: string;
  }>>([]);
  const [stops, setStops] = useState<Array<{ id: string; name: string; city: string }>>([]);
  const [filters, setFilters] = useState<Filters>({
    reference_type: 'all',
    dateFrom: '',
    dateTo: '',
    search: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showEventDialog, setShowEventDialog] = useState(false);

  const loadData = useCallback(async () => {
    if (!organizationId) return;

    try {
      const [eventsData, statsData, stoppedData, stopsData] = await Promise.all([
        trackingService.getTrackingEvents(organizationId, filters),
        trackingService.getTrackingStats(organizationId),
        trackingService.getStoppedItems(organizationId),
        trackingService.getTransportStops(organizationId),
      ]);
      setEvents(eventsData);
      setStats(statsData);
      setStoppedItems(stoppedData);
      setStops(stopsData);
    } catch (error) {
      console.error('Error loading tracking data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos de tracking',
        variant: 'destructive',
      });
    }
  }, [organizationId, filters, toast]);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await loadData();
      setIsLoading(false);
    };
    init();
  }, [loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
    toast({ title: 'Actualizado', description: 'Datos de tracking actualizados' });
  };

  const handleExport = () => {
    const csv = trackingService.exportToCSV(events);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tracking_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exportado', description: `${events.length} eventos exportados a CSV` });
  };

  const handleRegisterEvent = async (event: {
    reference_type: 'trip' | 'shipment';
    reference_id: string;
    event_type: string;
    description?: string;
    location_text?: string;
    stop_id?: string;
    external_event_id?: string;
  }) => {
    try {
      await trackingService.registerEvent(event);
      toast({ title: 'Evento registrado', description: 'El evento se registró correctamente' });
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw error;
    }
  };

  const handleSearchReferences = async (query: string) => {
    if (!organizationId) return [];
    return trackingService.searchReferences(organizationId, query);
  };

  if (!organizationId) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <TrackingHeader stats={stats} isLoading={isLoading} />

      <Card className="p-4">
        <TrackingFilters
          filters={filters}
          onFiltersChange={setFilters}
          onRefresh={handleRefresh}
          onExport={handleExport}
          onNewEvent={() => setShowEventDialog(true)}
          isRefreshing={isRefreshing}
        />
      </Card>

      <Tabs defaultValue="feed" className="w-full">
        <TabsList>
          <TabsTrigger value="feed" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Feed de Eventos
          </TabsTrigger>
          <TabsTrigger value="diagnostics" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Diagnóstico ({stoppedItems.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="feed" className="mt-4">
          <TrackingFeed events={events} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="diagnostics" className="mt-4">
          <StoppedItemsPanel
            items={stoppedItems}
            isLoading={isLoading}
            onRefresh={handleRefresh}
          />
        </TabsContent>
      </Tabs>

      <RegisterEventDialog
        open={showEventDialog}
        onOpenChange={setShowEventDialog}
        onSubmit={handleRegisterEvent}
        onSearchReferences={handleSearchReferences}
        stops={stops}
      />
    </div>
  );
}
