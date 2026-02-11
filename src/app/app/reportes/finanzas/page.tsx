'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  DollarSign, RefreshCw, Download, Save, ArrowLeft, FileSpreadsheet,
} from 'lucide-react';
import Link from 'next/link';
import { cn, formatCurrency } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';

import {
  finanzasReportService,
  FinanzasFilters,
  FinanzasKPI,
  FacturaResumen,
  PagoPorDia,
  PagoPorMetodo,
  AgingBucket,
  CxCResumen,
  CxPResumen,
  FinanzasFiltersComponent,
  FinanzasKPIs,
  PagosPorDiaChart,
  FinanzasPagosPorMetodoChart,
  AgingChart,
  FinanzasTopCxC,
  FinanzasTopCxP,
  FinanzasFacturasTable,
} from '@/components/reportes/finanzas';

function getDefaultFilters(): FinanzasFilters {
  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(today.getDate() - 30);
  return {
    dateFrom: monthAgo.toISOString().split('T')[0],
    dateTo: today.toISOString().split('T')[0],
    branchId: null, status: null, currency: null,
  };
}

export default function ReportesFinanzasPage() {
  const { organization } = useOrganization();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filters, setFilters] = useState<FinanzasFilters>(getDefaultFilters());

  // Datos
  const [kpis, setKpis] = useState<FinanzasKPI | null>(null);
  const [facturas, setFacturas] = useState<FacturaResumen[]>([]);
  const [totalFacturas, setTotalFacturas] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [pagosPorDia, setPagosPorDia] = useState<PagoPorDia[]>([]);
  const [pagosPorMetodo, setPagosPorMetodo] = useState<PagoPorMetodo[]>([]);
  const [aging, setAging] = useState<AgingBucket[]>([]);
  const [topCxC, setTopCxC] = useState<CxCResumen[]>([]);
  const [topCxP, setTopCxP] = useState<CxPResumen[]>([]);

  // Opciones
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [savedReports, setSavedReports] = useState<any[]>([]);

  // Modal guardar
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [reportName, setReportName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Cargar opciones
  useEffect(() => {
    if (!organization?.id) return;
    const loadOptions = async () => {
      const [branchesData, savedData] = await Promise.all([
        finanzasReportService.getBranches(organization.id),
        finanzasReportService.getSavedReports(organization.id),
      ]);
      setBranches(branchesData);
      setSavedReports(savedData);
    };
    loadOptions();
  }, [organization?.id]);

  // Cargar datos
  const loadReportData = useCallback(async () => {
    if (!organization?.id) return;
    setIsLoading(true);
    try {
      const [kpisData, facturasData, pagosDiaData, pagosMetData, agingData, cxcData, cxpData] = await Promise.all([
        finanzasReportService.getKPIs(organization.id, filters),
        finanzasReportService.getFacturas(organization.id, filters, page, pageSize),
        finanzasReportService.getPagosPorDia(organization.id, filters),
        finanzasReportService.getPagosPorMetodo(organization.id, filters),
        finanzasReportService.getAging(organization.id),
        finanzasReportService.getTopCxC(organization.id),
        finanzasReportService.getTopCxP(organization.id),
      ]);
      setKpis(kpisData);
      setFacturas(facturasData.data);
      setTotalFacturas(facturasData.total);
      setPagosPorDia(pagosDiaData);
      setPagosPorMetodo(pagosMetData);
      setAging(agingData);
      setTopCxC(cxcData);
      setTopCxP(cxpData);
    } catch (error) {
      console.error('Error cargando reporte financiero:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar los datos', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, filters, page, toast]);

  useEffect(() => { loadReportData(); }, [loadReportData]);

  const handleFiltersChange = (newFilters: FinanzasFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadReportData();
    setIsRefreshing(false);
    toast({ title: 'Actualizado', description: 'Datos del reporte actualizados' });
  };

  const handleExportCSV = () => {
    if (facturas.length === 0) {
      toast({ title: 'Sin datos', description: 'No hay datos para exportar', variant: 'destructive' });
      return;
    }
    const headers = ['Número', 'Emisión', 'Vencimiento', 'Cliente', 'Sucursal', 'Estado', 'Impuesto', 'Total', 'Saldo'];
    const rows = facturas.map((f) => [
      f.number, f.issue_date?.split('T')[0] || '', f.due_date?.split('T')[0] || '',
      f.customer_name || '', f.branch_name, f.status,
      f.tax_total.toString(), f.total.toString(), f.balance.toString(),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte-finanzas-${filters.dateFrom}-${filters.dateTo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exportado', description: 'Archivo CSV descargado' });
  };

  const handleSaveReport = async () => {
    if (!organization?.id || !reportName.trim()) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');
      const result = await finanzasReportService.saveReport(organization.id, user.id, {
        name: reportName.trim(), filters,
      });
      if (result) {
        toast({ title: 'Guardado', description: `Reporte "${reportName}" guardado` });
        setSaveDialogOpen(false);
        setReportName('');
        const updated = await finanzasReportService.getSavedReports(organization.id);
        setSavedReports(updated);
      }
    } catch {
      toast({ title: 'Error', description: 'No se pudo guardar', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadSavedReport = (report: any) => {
    const f = report.filters as FinanzasFilters;
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
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10 print:hidden">
        <div className="px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link href="/app/reportes" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <ArrowLeft className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </Link>
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <DollarSign className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Reporte Financiero</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Cartera, pagos, facturas y cuentas</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setSaveDialogOpen(true)} className="border-gray-300 dark:border-gray-700">
                <Save className="h-4 w-4 mr-2" /> Guardar
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportCSV} className="border-gray-300 dark:border-gray-700">
                <FileSpreadsheet className="h-4 w-4 mr-2" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()} className="border-gray-300 dark:border-gray-700">
                <Download className="h-4 w-4 mr-2" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing} className="border-gray-300 dark:border-gray-700">
                <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} /> Actualizar
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 sm:p-6 space-y-6">
          {/* Reportes guardados */}
          {savedReports.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 print:hidden">
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap flex-shrink-0">Guardados:</span>
              {savedReports.slice(0, 5).map((r) => (
                <button key={r.id} onClick={() => handleLoadSavedReport(r)}
                  className="text-xs px-3 py-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400 transition-colors whitespace-nowrap flex-shrink-0">
                  {r.name}
                </button>
              ))}
            </div>
          )}

          {/* Filtros */}
          <FinanzasFiltersComponent filters={filters} onFiltersChange={handleFiltersChange} branches={branches} isLoading={isLoading} />

          {/* KPIs */}
          <FinanzasKPIs data={kpis} isLoading={isLoading} />

          {/* Gráficas: Recaudo + Pagos por método */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PagosPorDiaChart data={pagosPorDia} isLoading={isLoading} />
            <FinanzasPagosPorMetodoChart data={pagosPorMetodo} isLoading={isLoading} />
          </div>

          {/* Aging */}
          <AgingChart data={aging} isLoading={isLoading} />

          {/* CxC y CxP */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <FinanzasTopCxC data={topCxC} isLoading={isLoading} />
            <FinanzasTopCxP data={topCxP} isLoading={isLoading} />
          </div>

          {/* Tabla de facturas */}
          <FinanzasFacturasTable
            data={facturas} total={totalFacturas}
            page={page} pageSize={pageSize} onPageChange={setPage}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Dialog Guardar */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="dark:text-gray-100">Guardar Reporte</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm text-gray-700 dark:text-gray-300 mb-1 block">Nombre del reporte</label>
              <Input value={reportName} onChange={(e) => setReportName(e.target.value)}
                placeholder="Ej: Cartera vencida enero"
                className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600" />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Se guardarán los filtros actuales para uso futuro.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)} className="border-gray-300 dark:border-gray-600">Cancelar</Button>
            <Button onClick={handleSaveReport} disabled={!reportName.trim() || isSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isSaving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
