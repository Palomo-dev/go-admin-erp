'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  ShoppingCart,
  RefreshCw,
  Download,
  Save,
  ArrowLeft,
  FileSpreadsheet,
  Clock,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';

import {
  ventasReportService,
  VentasFilters,
  VentasKPI,
  VentaPorDia,
  VentaPorSucursal,
  VentaPorMetodoPago,
  TopProductoVenta,
  TopClienteVenta,
  VentaDetalle,
  SavedReport,
  ReportExecution,
  VentasFiltersComponent,
  VentasKPIs,
  VentasPorDiaChart,
  VentasPorSucursalChart,
  PagosPorMetodoChart,
  VentasTopProductos,
  VentasTopClientes,
  VentasTable,
} from '@/components/reportes/ventas';

function getDefaultFilters(): VentasFilters {
  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(today.getDate() - 30);
  return {
    dateFrom: monthAgo.toISOString().split('T')[0],
    dateTo: today.toISOString().split('T')[0],
    branchId: null,
    status: null,
    paymentStatus: null,
    userId: null,
  };
}

export default function ReportesVentasPage() {
  const { organization } = useOrganization();
  const { toast } = useToast();

  // Estado principal
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filters, setFilters] = useState<VentasFilters>(getDefaultFilters());

  // Datos
  const [kpis, setKpis] = useState<VentasKPI | null>(null);
  const [ventasPorDia, setVentasPorDia] = useState<VentaPorDia[]>([]);
  const [ventasPorSucursal, setVentasPorSucursal] = useState<VentaPorSucursal[]>([]);
  const [pagosPorMetodo, setPagosPorMetodo] = useState<VentaPorMetodoPago[]>([]);
  const [topProductos, setTopProductos] = useState<TopProductoVenta[]>([]);
  const [topClientes, setTopClientes] = useState<TopClienteVenta[]>([]);
  const [ventasDetalle, setVentasDetalle] = useState<VentaDetalle[]>([]);
  const [totalVentas, setTotalVentas] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Opciones de filtros
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [sellers, setSellers] = useState<{ id: string; name: string }[]>([]);

  // Reportes guardados y ejecuciones
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [recentExecutions, setRecentExecutions] = useState<ReportExecution[]>([]);

  // Modal guardar reporte
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [reportName, setReportName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Cargar opciones de filtros
  useEffect(() => {
    if (!organization?.id) return;
    const loadOptions = async () => {
      const [branchesData, sellersData, savedData, execData] = await Promise.all([
        ventasReportService.getBranches(organization.id),
        ventasReportService.getSellers(organization.id),
        ventasReportService.getSavedReports(organization.id),
        ventasReportService.getRecentExecutions(organization.id),
      ]);
      setBranches(branchesData);
      setSellers(sellersData);
      setSavedReports(savedData);
      setRecentExecutions(execData);
    };
    loadOptions();
  }, [organization?.id]);

  // Cargar datos del reporte
  const loadReportData = useCallback(async () => {
    if (!organization?.id) return;

    const startTime = Date.now();
    setIsLoading(true);

    try {
      const [
        kpisData,
        ventasDiaData,
        ventasSucursalData,
        pagosData,
        topProdData,
        topCliData,
        detalleData,
      ] = await Promise.all([
        ventasReportService.getKPIs(organization.id, filters),
        ventasReportService.getVentasPorDia(organization.id, filters),
        ventasReportService.getVentasPorSucursal(organization.id, filters),
        ventasReportService.getPagosPorMetodo(organization.id, filters),
        ventasReportService.getTopProductos(organization.id, filters),
        ventasReportService.getTopClientes(organization.id, filters),
        ventasReportService.getVentasDetalle(organization.id, filters, page, pageSize),
      ]);

      setKpis(kpisData);
      setVentasPorDia(ventasDiaData);
      setVentasPorSucursal(ventasSucursalData);
      setPagosPorMetodo(pagosData);
      setTopProductos(topProdData);
      setTopClientes(topCliData);
      setVentasDetalle(detalleData.data);
      setTotalVentas(detalleData.total);

      // Log execution
      const duration = Date.now() - startTime;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        ventasReportService.logExecution(
          organization.id, user.id, filters, detalleData.total, duration
        );
      }
    } catch (error) {
      console.error('Error cargando reporte de ventas:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos del reporte',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, filters, page, toast]);

  useEffect(() => {
    loadReportData();
  }, [loadReportData]);

  // Handlers
  const handleFiltersChange = (newFilters: VentasFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadReportData();
    setIsRefreshing(false);
    toast({ title: 'Actualizado', description: 'Los datos del reporte se han actualizado' });
  };

  const handleExportCSV = () => {
    if (ventasDetalle.length === 0) {
      toast({ title: 'Sin datos', description: 'No hay datos para exportar', variant: 'destructive' });
      return;
    }
    const headers = ['Fecha', 'Sucursal', 'Cliente', 'Vendedor', 'Estado', 'Pago', 'Impuesto', 'Total'];
    const rows = ventasDetalle.map((s) => [
      s.sale_date?.split('T')[0] || '',
      s.branch_name,
      s.customer_name || '',
      s.seller_name || '',
      s.status,
      s.payment_status,
      s.tax_total.toString(),
      s.total.toString(),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte-ventas-${filters.dateFrom}-${filters.dateTo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exportado', description: 'El archivo CSV se ha descargado' });
  };

  const handleExportPDF = () => {
    window.print();
  };

  const handleSaveReport = async () => {
    if (!organization?.id || !reportName.trim()) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      const result = await ventasReportService.saveReport(organization.id, user.id, {
        name: reportName.trim(),
        filters,
      });

      if (result) {
        toast({ title: 'Guardado', description: `Reporte "${reportName}" guardado exitosamente` });
        setSaveDialogOpen(false);
        setReportName('');
        const updated = await ventasReportService.getSavedReports(organization.id);
        setSavedReports(updated);
      }
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo guardar el reporte', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadSavedReport = (report: SavedReport) => {
    const f = report.filters as unknown as VentasFilters;
    if (f.dateFrom && f.dateTo) {
      setFilters(f);
      setPage(1);
      toast({ title: 'Cargado', description: `Reporte "${report.name}" aplicado` });
    }
  };

  if (!organization) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Cargando organización...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header sticky */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10 print:hidden">
        <div className="px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link
                href="/app/reportes"
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </Link>
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <ShoppingCart className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  Reporte de Ventas
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Análisis y desempeño comercial
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSaveDialogOpen(true)}
                className="border-gray-300 dark:border-gray-700"
              >
                <Save className="h-4 w-4 mr-2" />
                Guardar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                className="border-gray-300 dark:border-gray-700"
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPDF}
                className="border-gray-300 dark:border-gray-700"
              >
                <Download className="h-4 w-4 mr-2" />
                PDF
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
      </div>

      {/* Content scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 sm:p-6 space-y-6">
          {/* Reportes guardados (barra superior) */}
          {savedReports.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 print:hidden">
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap flex-shrink-0">
                Guardados:
              </span>
              {savedReports.slice(0, 5).map((r) => (
                <button
                  key={r.id}
                  onClick={() => handleLoadSavedReport(r)}
                  className="text-xs px-3 py-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400 transition-colors whitespace-nowrap flex-shrink-0"
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}

          {/* Filtros */}
          <VentasFiltersComponent
            filters={filters}
            onFiltersChange={handleFiltersChange}
            branches={branches}
            sellers={sellers}
            isLoading={isLoading}
          />

          {/* KPIs */}
          <VentasKPIs data={kpis} isLoading={isLoading} />

          {/* Gráficas: Ventas por día + Pagos por método */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <VentasPorDiaChart data={ventasPorDia} isLoading={isLoading} />
            <PagosPorMetodoChart data={pagosPorMetodo} isLoading={isLoading} />
          </div>

          {/* Ventas por sucursal */}
          <VentasPorSucursalChart data={ventasPorSucursal} isLoading={isLoading} />

          {/* Top Productos + Top Clientes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <VentasTopProductos data={topProductos} isLoading={isLoading} />
            <VentasTopClientes data={topClientes} isLoading={isLoading} />
          </div>

          {/* Tabla de detalle */}
          <VentasTable
            data={ventasDetalle}
            total={totalVentas}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            isLoading={isLoading}
          />

          {/* Últimas ejecuciones */}
          {recentExecutions.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 print:hidden">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-700">
                  <Clock className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                </div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  Últimas Ejecuciones
                </h3>
              </div>
              <div className="space-y-2">
                {recentExecutions.map((exec) => (
                  <div
                    key={exec.id}
                    className="flex items-center justify-between text-xs py-1.5 px-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/30"
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'w-2 h-2 rounded-full',
                        exec.status === 'completed' ? 'bg-green-500' : exec.status === 'running' ? 'bg-blue-500 animate-pulse' : 'bg-red-500'
                      )} />
                      <span className="text-gray-600 dark:text-gray-400">
                        {new Date(exec.created_at).toLocaleString('es-ES', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500 dark:text-gray-400">
                        {exec.row_count.toLocaleString()} filas
                      </span>
                      <span className="text-gray-400 dark:text-gray-500">
                        {exec.duration_ms}ms
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialog Guardar Reporte */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="dark:text-gray-100">Guardar Reporte</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm text-gray-700 dark:text-gray-300 mb-1 block">
                Nombre del reporte
              </label>
              <Input
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder="Ej: Ventas mensuales por sucursal"
                className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Se guardarán los filtros actuales. Podrás cargarlos después desde la barra superior.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSaveDialogOpen(false)}
              className="border-gray-300 dark:border-gray-600"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveReport}
              disabled={!reportName.trim() || isSaving}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSaving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
