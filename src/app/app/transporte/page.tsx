'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { transportService, TransportStats, DashboardFilters } from '@/lib/services/transportService';
import { 
  DashboardHeader,
  DashboardStats,
  DashboardQuickActions,
  DashboardRecentEvents,
  TransportFilters,
  TransportFiltersState,
} from '@/components/transporte/dashboard';
import { format } from 'date-fns';

interface Event {
  id: string;
  reference_type: string;
  reference_id: string;
  event_type: string;
  event_time: string;
  latitude?: number;
  longitude?: number;
  location_text?: string;
  description?: string;
}

interface Branch {
  id: number;
  name: string;
}

interface Carrier {
  id: string;
  name: string;
  code: string;
}

export default function TransportePage() {
  const { toast } = useToast();
  const { organization, branches } = useOrganization();
  
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<TransportStats | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  
  // Filters state
  const [filters, setFilters] = useState<TransportFiltersState>({
    branchId: 'all',
    carrierId: 'all',
    dateFrom: new Date(),
    dateTo: new Date(),
  });

  const loadCarriers = useCallback(async () => {
    if (!organization?.id) return;
    try {
      const carriersData = await transportService.getCarriers(organization.id);
      setCarriers(carriersData || []);
    } catch (error) {
      console.warn('Error cargando transportadoras:', error);
    }
  }, [organization?.id]);

  const loadData = useCallback(async () => {
    if (!organization?.id) return;
    
    setIsLoading(true);
    try {
      const dashboardFilters: DashboardFilters = {
        branchId: filters.branchId !== 'all' ? filters.branchId : undefined,
        carrierId: filters.carrierId !== 'all' ? filters.carrierId : undefined,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      };

      const [statsData, eventsData] = await Promise.all([
        transportService.getStatsWithFilters(organization.id, dashboardFilters),
        transportService.getRecentEvents(organization.id, 10),
      ]);
      
      setStats(statsData);
      setEvents(eventsData);
    } catch (error) {
      console.error('Error cargando datos de transporte:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos del módulo de transporte',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, filters, toast]);

  useEffect(() => {
    loadCarriers();
  }, [loadCarriers]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFiltersChange = (newFilters: TransportFiltersState) => {
    setFilters(newFilters);
  };

  const handleExport = () => {
    if (!stats) return;
    
    const exportData = {
      fecha_exportacion: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
      rango_fechas: {
        desde: format(filters.dateFrom, 'yyyy-MM-dd'),
        hasta: format(filters.dateTo, 'yyyy-MM-dd'),
      },
      viajes: stats.trips,
      envios: stats.shipments,
      boletos: stats.tickets,
      incidentes: stats.incidents,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transporte-dashboard-${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: 'Exportación completada',
      description: 'Los datos del dashboard han sido exportados.',
    });
  };

  const branchList: Branch[] = branches?.map(b => ({ id: b.id, name: b.name })) || [];

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <DashboardHeader />
      
      {/* Filtros */}
      <TransportFilters
        branches={branchList}
        carriers={carriers}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onRefresh={loadData}
        onExport={handleExport}
        isLoading={isLoading}
      />
      
      {/* KPIs */}
      <DashboardStats stats={stats} isLoading={isLoading} />
      
      {/* Quick Actions y Recent Events */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DashboardQuickActions />
        </div>
        <div>
          <DashboardRecentEvents events={events} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
