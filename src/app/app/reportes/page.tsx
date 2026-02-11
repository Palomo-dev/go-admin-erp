'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BarChart3, RefreshCw, Download, Star, StarOff } from 'lucide-react';
import { cn } from '@/utils/Utils';

import {
  reportesService,
  ReportesDashboardData,
  ReportesKPIs,
  ReportesVentasChart,
  ReportesPagosChart,
  ReportesTopProductos,
  ReportesTopSucursales,
  ReportesAtajos,
  ReportesOcupacion,
  ReportesActividad,
} from '@/components/reportes';

export default function ReportesPage() {
  const { organization } = useOrganization();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState<ReportesDashboardData | null>(null);
  const [periodo, setPeriodo] = useState('30');
  const [isFavorite, setIsFavorite] = useState(false);

  // Cargar favorito desde localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsFavorite(localStorage.getItem('reportes_dashboard_fav') === 'true');
    }
  }, []);

  const loadDashboardData = useCallback(async () => {
    if (!organization?.id) return;

    setIsLoading(true);
    try {
      const data = await reportesService.getDashboardData(organization.id, Number(periodo));
      setDashboardData(data);
    } catch (error) {
      console.error('Error cargando datos del dashboard:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos del dashboard',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, periodo, toast]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadDashboardData();
    setIsRefreshing(false);
    toast({ title: 'Datos actualizados', description: 'El dashboard se ha actualizado correctamente' });
  };

  const handleToggleFavorite = () => {
    const newVal = !isFavorite;
    setIsFavorite(newVal);
    localStorage.setItem('reportes_dashboard_fav', String(newVal));
    toast({
      title: newVal ? 'Agregado a favoritos' : 'Eliminado de favoritos',
      description: newVal
        ? 'El dashboard se ha marcado como favorito'
        : 'El dashboard se ha desmarcado como favorito',
    });
  };

  const handleExportPDF = () => {
    window.print();
    toast({ title: 'Exportar', description: 'Se abrió el diálogo de impresión/PDF' });
  };

  if (!organization) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Cargando organización...</div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen print:bg-white">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <BarChart3 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Dashboard de Reportes
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
                {new Date().toLocaleDateString('es-ES', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <Select value={periodo} onValueChange={setPeriodo}>
              <SelectTrigger className="w-[140px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 días</SelectItem>
                <SelectItem value="15">Últimos 15 días</SelectItem>
                <SelectItem value="30">Últimos 30 días</SelectItem>
                <SelectItem value="90">Últimos 90 días</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleFavorite}
              className="border-gray-300 dark:border-gray-700"
            >
              {isFavorite ? (
                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
              ) : (
                <StarOff className="h-4 w-4" />
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPDF}
              className="border-gray-300 dark:border-gray-700"
            >
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="border-gray-300 dark:border-gray-700"
            >
              <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
              Actualizar
            </Button>
          </div>
        </div>
      </div>

      {/* Atajos rápidos */}
      <ReportesAtajos />

      {/* KPIs */}
      <ReportesKPIs data={dashboardData?.kpis ?? null} isLoading={isLoading} />

      {/* Gráficas principales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ReportesVentasChart
          data={dashboardData?.ventasDiarias ?? []}
          isLoading={isLoading}
        />
        <ReportesPagosChart
          data={dashboardData?.pagosPorMetodo ?? []}
          isLoading={isLoading}
        />
      </div>

      {/* Segunda fila: Top Productos + Top Sucursales + Ocupación */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ReportesTopProductos
          data={dashboardData?.topProductos ?? []}
          isLoading={isLoading}
        />
        <ReportesTopSucursales
          data={dashboardData?.topSucursales ?? []}
          isLoading={isLoading}
        />
        <ReportesOcupacion
          data={dashboardData?.ocupacion ?? null}
          isLoading={isLoading}
        />
      </div>

      {/* Actividad reciente */}
      <ReportesActividad
        data={dashboardData?.actividadReciente ?? []}
        isLoading={isLoading}
      />
    </div>
  );
}
