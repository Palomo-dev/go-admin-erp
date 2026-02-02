'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, BarChart3, AlertCircle } from 'lucide-react';
import parkingReportService, {
  type ReportSummary,
  type OccupancyByHour,
  type RevenueByPeriod,
  type ZoneStats,
  type VehicleTypeStats,
  type PassVsOccasional,
} from '@/lib/services/parkingReportService';
import {
  ReportesHeader,
  ReportesFilters,
  ReportesSummary,
  OccupancyChart,
  RevenueChart,
  ZoneStatsTable,
  VehicleTypeChart,
  PassVsOccasionalChart,
  TopPlatesTable,
  type ReportFiltersState,
} from '@/components/parking/reportes';

const getDefaultFilters = (): ReportFiltersState => {
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  return {
    startDate: thirtyDaysAgo.toISOString().split('T')[0],
    endDate: today.toISOString().split('T')[0],
    groupBy: 'day',
    vehicleType: 'all',
  };
};

const initialSummary: ReportSummary = {
  total_sessions: 0,
  total_revenue: 0,
  avg_duration: 0,
  avg_ticket: 0,
  occupancy_rate: 0,
  rotation_index: 0,
};

export default function ReportesPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  const [filters, setFilters] = useState<ReportFiltersState>(getDefaultFilters);
  const [isLoading, setIsLoading] = useState(true);

  // Data states
  const [summary, setSummary] = useState<ReportSummary>(initialSummary);
  const [occupancyData, setOccupancyData] = useState<OccupancyByHour[]>([]);
  const [revenueData, setRevenueData] = useState<RevenueByPeriod[]>([]);
  const [zoneStats, setZoneStats] = useState<ZoneStats[]>([]);
  const [vehicleStats, setVehicleStats] = useState<VehicleTypeStats[]>([]);
  const [passVsOccasional, setPassVsOccasional] = useState<PassVsOccasional>({
    subscribers: 0,
    occasional: 0,
    subscriber_revenue: 0,
    occasional_revenue: 0,
  });
  const [topPlates, setTopPlates] = useState<{ plate: string; visits: number; totalSpent: number }[]>([]);

  // Cargar datos
  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    setIsLoading(true);
    try {
      const reportFilters = {
        startDate: filters.startDate,
        endDate: filters.endDate,
        vehicleType: filters.vehicleType === 'all' ? undefined : filters.vehicleType,
      };

      const [
        summaryData,
        occupancy,
        revenue,
        zones,
        vehicles,
        passOccasional,
        plates,
      ] = await Promise.all([
        parkingReportService.getReportSummary(organization.id, reportFilters),
        parkingReportService.getOccupancyByHour(organization.id, reportFilters),
        parkingReportService.getRevenueByPeriod(organization.id, reportFilters, filters.groupBy),
        parkingReportService.getZoneStats(organization.id, reportFilters),
        parkingReportService.getVehicleTypeStats(organization.id, reportFilters),
        parkingReportService.getPassVsOccasional(organization.id, reportFilters),
        parkingReportService.getTopPlates(organization.id, reportFilters, 10),
      ]);

      setSummary(summaryData);
      setOccupancyData(occupancy);
      setRevenueData(revenue);
      setZoneStats(zones);
      setVehicleStats(vehicles);
      setPassVsOccasional(passOccasional);
      setTopPlates(plates);
    } catch (error) {
      console.error('Error loading report data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos del reporte',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, filters, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadData();
    }
  }, [organization?.id, orgLoading, loadData]);

  // Handlers
  const handleExport = async () => {
    if (!organization?.id) return;

    try {
      const csv = await parkingReportService.exportToCSV(organization.id, {
        startDate: filters.startDate,
        endDate: filters.endDate,
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `reporte_parking_${filters.startDate}_${filters.endDate}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast({
        title: 'Exportación completada',
        description: 'El archivo CSV se ha descargado',
      });
    } catch (error) {
      console.error('Error exporting data:', error);
      toast({
        title: 'Error',
        description: 'No se pudo exportar el reporte',
        variant: 'destructive',
      });
    }
  };

  const handleSaveFilters = () => {
    // Guardar filtros en localStorage
    localStorage.setItem('parkingReportFilters', JSON.stringify(filters));
    toast({
      title: 'Filtros guardados',
      description: 'Los filtros se han guardado correctamente',
    });
  };

  // Cargar filtros guardados al iniciar
  useEffect(() => {
    const savedFilters = localStorage.getItem('parkingReportFilters');
    if (savedFilters) {
      try {
        setFilters(JSON.parse(savedFilters));
      } catch {
        // Ignorar error de parsing
      }
    }
  }, []);

  // Loading state
  if (orgLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // No organization
  if (!organization) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <AlertCircle className="h-12 w-12 text-yellow-500 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Sin organización
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          Debes pertenecer a una organización para acceder a esta página.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <ReportesHeader
        onRefresh={loadData}
        onExport={handleExport}
        onSaveFilters={handleSaveFilters}
        isLoading={isLoading}
      />

      {/* Filters */}
      <ReportesFilters filters={filters} onFiltersChange={setFilters} />

      {/* Summary Stats */}
      <ReportesSummary summary={summary} isLoading={isLoading} />

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ocupación por hora */}
        <OccupancyChart data={occupancyData} isLoading={isLoading} />

        {/* Ingresos por período */}
        <RevenueChart data={revenueData} isLoading={isLoading} />
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tipo de vehículo */}
        <VehicleTypeChart data={vehicleStats} isLoading={isLoading} />

        {/* Abonados vs Ocasionales */}
        <PassVsOccasionalChart data={passVsOccasional} isLoading={isLoading} />

        {/* Top Placas */}
        <TopPlatesTable data={topPlates} isLoading={isLoading} />
      </div>

      {/* Zone Stats */}
      <ZoneStatsTable data={zoneStats} isLoading={isLoading} />

      {/* No data message */}
      {!isLoading && summary.total_sessions === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
            <BarChart3 className="h-12 w-12 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Sin datos para el período
          </h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-sm">
            No hay sesiones registradas en el rango de fechas seleccionado.
            Prueba con un período diferente.
          </p>
        </div>
      )}
    </div>
  );
}
