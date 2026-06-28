'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { BarChart3, RefreshCw, Download, Star, StarOff, CalendarDays } from 'lucide-react';
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
  TopProducto,
} from '@/components/reportes';
import { WebConversionCard } from '@/components/reportes/ventas';

export default function ReportesPage() {
  const { organization } = useOrganization();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState<ReportesDashboardData | null>(null);
  const [periodo, setPeriodo] = useState('30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [topProductosSource, setTopProductosSource] = useState<'all' | 'pos' | 'web' | 'invoice'>('all');
  const [topProductos, setTopProductos] = useState<TopProducto[]>([]);
  const [isLoadingTopProductos, setIsLoadingTopProductos] = useState(false);

  // Cargar favorito desde localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsFavorite(localStorage.getItem('reportes_dashboard_fav') === 'true');
    }
  }, []);

  const getDias = useCallback((): number => {
    if (periodo === '0') return 0; // hoy
    if (periodo === '1') return 1; // ayer
    if (periodo === 'custom') return 30; // fallback
    return Number(periodo);
  }, [periodo]);

  const getDateRange = useCallback((): { from?: string; to?: string } => {
    if (periodo === 'custom' && customFrom && customTo) {
      return { from: customFrom, to: customTo };
    }
    // Usar fecha local (no UTC) para evitar desfases de zona horaria
    const toLocalDate = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    if (periodo === '0') {
      const hoy = toLocalDate(new Date());
      return { from: hoy, to: hoy };
    }
    if (periodo === '1') {
      const ayer = new Date();
      ayer.setDate(ayer.getDate() - 1);
      return { from: toLocalDate(ayer), to: toLocalDate(ayer) };
    }
    return {};
  }, [periodo, customFrom, customTo]);

  const loadDashboardData = useCallback(async () => {
    if (!organization?.id) return;

    setIsLoading(true);
    try {
      const range = getDateRange();
      const data = await reportesService.getDashboardData(
        organization.id,
        getDias(),
        range.from,
        range.to
      );
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
  }, [organization?.id, periodo, getDias, getDateRange, toast]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Cargar solo top productos cuando cambia el source (carga rapida independiente)
  const loadTopProductos = useCallback(async () => {
    if (!organization?.id) return;
    setIsLoadingTopProductos(true);
    try {
      const range = getDateRange();
      const data = await reportesService.getTopProductos(
        organization.id, 5, getDias(), range.from, topProductosSource
      );
      setTopProductos(data);
    } catch (error) {
      console.error('Error cargando top productos:', error);
    } finally {
      setIsLoadingTopProductos(false);
    }
  }, [organization?.id, getDias, getDateRange, topProductosSource]);

  useEffect(() => {
    loadTopProductos();
  }, [loadTopProductos]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshKey((k) => k + 1);
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
              <SelectTrigger className="w-[160px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Hoy</SelectItem>
                <SelectItem value="1">Ayer</SelectItem>
                <SelectItem value="7">Últimos 7 días</SelectItem>
                <SelectItem value="15">Últimos 15 días</SelectItem>
                <SelectItem value="30">Últimos 30 días</SelectItem>
                <SelectItem value="90">Últimos 90 días</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>

            {periodo === 'custom' && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
                    <CalendarDays className="h-4 w-4 mr-1" />
                    {customFrom && customTo ? `${customFrom} - ${customTo}` : 'Rango'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-4 space-y-3" align="end">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Desde</label>
                    <Input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Hasta</label>
                    <Input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={!customFrom || !customTo}
                    onClick={() => handleRefresh()}
                  >
                    Aplicar
                  </Button>
                </PopoverContent>
              </Popover>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleFavorite}
              className="border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
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
              className="border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
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
          data={topProductos}
          isLoading={isLoading || isLoadingTopProductos}
          source={topProductosSource}
          onSourceChange={setTopProductosSource}
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

      {/* Conversión Web */}
      {organization?.id && (
        <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
          <WebConversionCard
            organizationId={organization.id}
            dateFrom={getDateRange().from || new Date(Date.now() - getDias() * 86400000).toISOString().split('T')[0]}
            dateTo={getDateRange().to || new Date().toISOString().split('T')[0]}
            refreshKey={refreshKey}
            isRefreshing={isRefreshing}
          />
        </div>
      )}

      {/* Actividad reciente */}
      <ReportesActividad
        data={dashboardData?.actividadReciente ?? []}
        isLoading={isLoading}
      />
    </div>
  );
}
