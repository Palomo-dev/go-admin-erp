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
  Shield, RefreshCw, Download, Save, ArrowLeft, FileSpreadsheet,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';

import {
  auditoriaReportService,
  AuditoriaFilters,
  AuditoriaKPI,
  EventosPorDia,
  EventosPorModulo,
  UsuarioActivo,
  ErrorIntegracion,
  EventoAuditoria,
  AuditoriaFiltersComponent,
  AuditoriaKPIs,
  EventosPorDiaChart,
  EventosPorModuloChart,
  UsuariosActivosList,
  ErroresIntegracionList,
  AuditoriaEventosTable,
} from '@/components/reportes/auditoria';

function getDefaultFilters(): AuditoriaFilters {
  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(today.getDate() - 30);
  return {
    dateFrom: monthAgo.toISOString().split('T')[0],
    dateTo: today.toISOString().split('T')[0],
    module: null, action: null, userId: null,
  };
}

export default function ReportesAuditoriaPage() {
  const { organization } = useOrganization();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filters, setFilters] = useState<AuditoriaFilters>(getDefaultFilters());

  // Datos
  const [kpis, setKpis] = useState<AuditoriaKPI | null>(null);
  const [eventosDia, setEventosDia] = useState<EventosPorDia[]>([]);
  const [eventosModulo, setEventosModulo] = useState<EventosPorModulo[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioActivo[]>([]);
  const [errores, setErrores] = useState<ErrorIntegracion[]>([]);
  const [eventos, setEventos] = useState<EventoAuditoria[]>([]);

  // Reportes guardados
  const [savedReports, setSavedReports] = useState<any[]>([]);

  // Modal guardar
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [reportName, setReportName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Cargar opciones
  useEffect(() => {
    if (!organization?.id) return;
    auditoriaReportService.getSavedReports(organization.id).then(setSavedReports);
  }, [organization?.id]);

  // Cargar datos
  const loadReportData = useCallback(async () => {
    if (!organization?.id) return;
    setIsLoading(true);
    try {
      const [kpisData, diaData, modData, usrData, errData, evtData] = await Promise.all([
        auditoriaReportService.getKPIs(organization.id, filters),
        auditoriaReportService.getEventosPorDia(organization.id, filters),
        auditoriaReportService.getEventosPorModulo(organization.id, filters),
        auditoriaReportService.getUsuariosActivos(organization.id, filters),
        auditoriaReportService.getErroresIntegracion(organization.id, filters),
        auditoriaReportService.getEventosRecientes(organization.id, filters),
      ]);
      setKpis(kpisData);
      setEventosDia(diaData);
      setEventosModulo(modData);
      setUsuarios(usrData);
      setErrores(errData);
      setEventos(evtData);
    } catch (error) {
      console.error('Error cargando reporte auditoría:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar los datos', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, filters, toast]);

  useEffect(() => { loadReportData(); }, [loadReportData]);

  const handleFiltersChange = (newFilters: AuditoriaFilters) => { setFilters(newFilters); };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadReportData();
    setIsRefreshing(false);
    toast({ title: 'Actualizado', description: 'Datos del reporte actualizados' });
  };

  const handleExportCSV = () => {
    if (eventos.length === 0) {
      toast({ title: 'Sin datos', description: 'No hay datos para exportar', variant: 'destructive' });
      return;
    }
    const headers = ['Fecha', 'Usuario', 'Acción', 'Entidad', 'ID Entidad', 'IP'];
    const rows = eventos.map((e) => [
      new Date(e.created_at).toISOString(), e.user_name, e.action,
      e.entity_type, e.entity_id, e.ip_address || '',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte-auditoria-${filters.dateFrom}-${filters.dateTo}.csv`;
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
      const result = await auditoriaReportService.saveReport(organization.id, user.id, {
        name: reportName.trim(), filters,
      });
      if (result) {
        toast({ title: 'Guardado', description: `Reporte "${reportName}" guardado` });
        setSaveDialogOpen(false);
        setReportName('');
        const updated = await auditoriaReportService.getSavedReports(organization.id);
        setSavedReports(updated);
      }
    } catch {
      toast({ title: 'Error', description: 'No se pudo guardar', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadSavedReport = (report: any) => {
    const f = report.filters as AuditoriaFilters;
    if (f.dateFrom && f.dateTo) {
      setFilters(f);
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
                <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Reporte de Auditoría</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Actividad del sistema, usuarios y errores</p>
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
          <AuditoriaFiltersComponent filters={filters} onFiltersChange={handleFiltersChange} isLoading={isLoading} />

          {/* KPIs */}
          <AuditoriaKPIs data={kpis} isLoading={isLoading} />

          {/* Gráficas: Actividad/día + Por módulo */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <EventosPorDiaChart data={eventosDia} isLoading={isLoading} />
            <EventosPorModuloChart data={eventosModulo} isLoading={isLoading} />
          </div>

          {/* Usuarios activos + Errores integración */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <UsuariosActivosList data={usuarios} isLoading={isLoading} />
            <ErroresIntegracionList data={errores} isLoading={isLoading} />
          </div>

          {/* Tabla de eventos */}
          <AuditoriaEventosTable data={eventos} isLoading={isLoading} />
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
                placeholder="Ej: Auditoría semanal compliance"
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
