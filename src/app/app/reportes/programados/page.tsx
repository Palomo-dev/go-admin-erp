'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import {
  CalendarClock, Plus, RefreshCw, ArrowLeft, Upload,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';

import {
  scheduledReportService,
  ScheduledReport,
  ScheduledFormData,
  SavedReportOption,
  ReportExecution,
  ScheduledFilters,
  ScheduledList,
  ScheduledDialog,
  ExecutionHistory,
} from '@/components/reportes/programados';

export default function ReportesProgramadosPage() {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Datos
  const [schedules, setSchedules] = useState<ScheduledReport[]>([]);
  const [savedReports, setSavedReports] = useState<SavedReportOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filtros
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [frequencyFilter, setFrequencyFilter] = useState('all');

  // Dialog crear/editar
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<ScheduledReport | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Dialog historial
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState<ScheduledReport | null>(null);
  const [executions, setExecutions] = useState<ReportExecution[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ─── Carga de datos ────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!organization?.id) return;
    setIsLoading(true);
    try {
      const [schedulesData, savedData] = await Promise.all([
        scheduledReportService.getScheduledReports(organization.id),
        scheduledReportService.getSavedReports(organization.id),
      ]);
      setSchedules(schedulesData);
      setSavedReports(savedData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar los datos', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Filtrado client-side ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return schedules.filter((s) => {
      const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase());
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && s.is_active) ||
        (statusFilter === 'inactive' && !s.is_active);
      const matchFreq = frequencyFilter === 'all' || s.frequency === frequencyFilter;
      return matchSearch && matchStatus && matchFreq;
    });
  }, [schedules, search, statusFilter, frequencyFilter]);

  // ─── Acciones ──────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
    toast({ title: 'Actualizado', description: 'Datos actualizados correctamente' });
  };

  const handleNew = () => {
    setEditItem(null);
    setDialogOpen(true);
  };

  const handleEdit = (item: ScheduledReport) => {
    setEditItem(item);
    setDialogOpen(true);
  };

  const handleSave = async (formData: ScheduledFormData) => {
    if (!organization?.id) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      if (editItem) {
        const result = await scheduledReportService.update(editItem.id, formData);
        if (result) {
          toast({ title: 'Actualizado', description: `"${formData.name}" actualizado` });
        } else {
          throw new Error('Error al actualizar');
        }
      } else {
        const result = await scheduledReportService.create(organization.id, user.id, formData);
        if (result) {
          toast({ title: 'Creado', description: `"${formData.name}" creado exitosamente` });
        } else {
          throw new Error('Error al crear');
        }
      }

      setDialogOpen(false);
      setEditItem(null);
      await loadData();
    } catch (error) {
      console.error('Error guardando:', error);
      toast({ title: 'Error', description: 'No se pudo guardar la programación', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDuplicate = async (item: ScheduledReport) => {
    if (!organization?.id) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');
      const result = await scheduledReportService.duplicate(organization.id, user.id, item);
      if (result) {
        toast({ title: 'Duplicado', description: `Copia de "${item.name}" creada` });
        await loadData();
      }
    } catch {
      toast({ title: 'Error', description: 'No se pudo duplicar', variant: 'destructive' });
    }
  };

  const handleDelete = async (item: ScheduledReport) => {
    const ok = await scheduledReportService.delete(item.id);
    if (ok) {
      toast({ title: 'Eliminado', description: `"${item.name}" eliminado` });
      await loadData();
    } else {
      toast({ title: 'Error', description: 'No se pudo eliminar', variant: 'destructive' });
    }
  };

  const handleToggleActive = async (item: ScheduledReport) => {
    const ok = await scheduledReportService.toggleActive(item.id, !item.is_active);
    if (ok) {
      toast({
        title: item.is_active ? 'Desactivado' : 'Activado',
        description: `"${item.name}" ${item.is_active ? 'desactivado' : 'activado'}`,
      });
      await loadData();
    } else {
      toast({ title: 'Error', description: 'No se pudo cambiar el estado', variant: 'destructive' });
    }
  };

  const handleExecuteNow = async (item: ScheduledReport) => {
    if (!organization?.id) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');
      const result = await scheduledReportService.executeNow(organization.id, user.id, item);
      if (result) {
        toast({ title: 'Ejecutado', description: `"${item.name}" ejecutado correctamente` });
        await loadData();
      }
    } catch {
      toast({ title: 'Error', description: 'No se pudo ejecutar', variant: 'destructive' });
    }
  };

  const handleViewHistory = async (item: ScheduledReport) => {
    setHistoryItem(item);
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const execs = await scheduledReportService.getExecutionHistory(
        organization?.id || 0,
        item.saved_report_id,
        20
      );
      setExecutions(execs);
    } catch {
      setExecutions([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleImportJSON = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file || !organization?.id) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('No autenticado');

        const items = Array.isArray(imported) ? imported : [imported];
        let count = 0;
        for (const item of items) {
          const result = await scheduledReportService.create(organization.id, user.id, {
            name: item.name || 'Importado',
            saved_report_id: item.saved_report_id || null,
            frequency: item.frequency || 'weekly',
            recipients: item.recipients || [],
            is_active: item.is_active ?? true,
            next_run_at: null,
          });
          if (result) count++;
        }
        toast({ title: 'Importado', description: `${count} programación(es) importada(s)` });
        await loadData();
      } catch {
        toast({ title: 'Error', description: 'No se pudo importar el archivo', variant: 'destructive' });
      }
    };
    input.click();
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  if (!mounted || !organization) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Cargando organización...</div>
      </div>
    );
  }

  const activeCount = schedules.filter((s) => s.is_active).length;
  const inactiveCount = schedules.filter((s) => !s.is_active).length;

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <div className="px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link href="/app/reportes" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <ArrowLeft className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </Link>
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <CalendarClock className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Reportes Programados</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {schedules.length} programación{schedules.length !== 1 ? 'es' : ''}
                  {activeCount > 0 && <> · <span className="text-green-600 dark:text-green-400">{activeCount} activo{activeCount !== 1 ? 's' : ''}</span></>}
                  {inactiveCount > 0 && <> · <span className="text-gray-400">{inactiveCount} inactivo{inactiveCount !== 1 ? 's' : ''}</span></>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleImportJSON} className="border-gray-300 dark:border-gray-700">
                <Upload className="h-4 w-4 mr-2" /> Importar
              </Button>
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing} className="border-gray-300 dark:border-gray-700">
                <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} /> Actualizar
              </Button>
              <Button size="sm" onClick={handleNew} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="h-4 w-4 mr-2" /> Nueva programación
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 sm:p-6 space-y-4">
          {/* Filtros */}
          <ScheduledFilters
            search={search} onSearchChange={setSearch}
            statusFilter={statusFilter} onStatusChange={setStatusFilter}
            frequencyFilter={frequencyFilter} onFrequencyChange={setFrequencyFilter}
          />

          {/* Lista */}
          <ScheduledList
            data={filtered}
            isLoading={isLoading}
            onEdit={handleEdit}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            onToggleActive={handleToggleActive}
            onExecuteNow={handleExecuteNow}
            onViewHistory={handleViewHistory}
          />
        </div>
      </div>

      {/* Dialog Crear/Editar */}
      <ScheduledDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editItem={editItem}
        savedReports={savedReports}
        isSaving={isSaving}
        onSave={handleSave}
      />

      {/* Dialog Historial */}
      <ExecutionHistory
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        scheduleName={historyItem?.name || ''}
        executions={executions}
        isLoading={historyLoading}
      />
    </div>
  );
}
