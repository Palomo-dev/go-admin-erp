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
  Wrench, RefreshCw, Download, Save, ArrowLeft, FileSpreadsheet,
  Play, Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';

import {
  reportBuilderService,
  ReportConfig,
  ReportFilter,
  ReportResult,
  SourceSelector,
  ColumnSelector,
  FilterBuilder,
  GroupBySelector,
  ResultsPreview,
} from '@/components/reportes/personalizados';

function getDefaultConfig(): ReportConfig {
  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(today.getDate() - 30);
  return {
    sourceId: '',
    columns: [],
    filters: [],
    groupBy: null,
    metric: null,
    metricColumn: null,
    dateFrom: monthAgo.toISOString().split('T')[0],
    dateTo: today.toISOString().split('T')[0],
    limit: 100,
  };
}

export default function ReportesPersonalizadosPage() {
  const { organization } = useOrganization();
  const { toast } = useToast();

  const [config, setConfig] = useState<ReportConfig>(getDefaultConfig());
  const [result, setResult] = useState<ReportResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);

  // Reportes guardados
  const [savedReports, setSavedReports] = useState<any[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [reportName, setReportName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const source = reportBuilderService.getSource(config.sourceId);

  // Cargar guardados
  useEffect(() => {
    if (!organization?.id) return;
    reportBuilderService.getSavedReports(organization.id).then(setSavedReports);
  }, [organization?.id]);

  // Ejecutar reporte
  const handleExecute = useCallback(async () => {
    if (!organization?.id || !config.sourceId) {
      toast({ title: 'Selecciona una fuente', description: 'Elige la fuente de datos antes de ejecutar', variant: 'destructive' });
      return;
    }

    setIsExecuting(true);
    setExecError(null);
    try {
      const finalConfig = {
        ...config,
        columns: config.columns.length > 0 ? config.columns : (source?.columns.map((c) => c.key) || []),
      };
      const res = await reportBuilderService.executeReport(organization.id, finalConfig);
      setResult(res);
      toast({ title: 'Ejecutado', description: `${res.total} resultados obtenidos` });
    } catch (error: any) {
      setExecError(error.message || 'Error desconocido');
      toast({ title: 'Error', description: 'No se pudo ejecutar el reporte', variant: 'destructive' });
    } finally {
      setIsExecuting(false);
    }
  }, [organization?.id, config, source, toast]);

  // Cambiar fuente
  const handleSourceChange = (sourceId: string) => {
    const src = reportBuilderService.getSource(sourceId);
    setConfig((prev) => ({
      ...prev,
      sourceId,
      columns: src ? src.columns.map((c) => c.key) : [],
      filters: [],
      groupBy: null, metric: null, metricColumn: null,
    }));
    setResult(null);
    setExecError(null);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!result || result.rows.length === 0) {
      toast({ title: 'Sin datos', description: 'Ejecuta el reporte primero', variant: 'destructive' });
      return;
    }
    const headers = result.columns;
    const rows = result.rows.map((r) => headers.map((h) => String(r[h] ?? '')));
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte-personalizado-${config.sourceId}-${config.dateFrom}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exportado', description: 'CSV descargado' });
  };

  // Guardar
  const handleSaveReport = async () => {
    if (!organization?.id || !reportName.trim()) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');
      const res = await reportBuilderService.saveReport(organization.id, user.id, {
        name: reportName.trim(), config,
      });
      if (res) {
        toast({ title: 'Guardado', description: `Reporte "${reportName}" guardado` });
        setSaveDialogOpen(false);
        setReportName('');
        const updated = await reportBuilderService.getSavedReports(organization.id);
        setSavedReports(updated);
      }
    } catch {
      toast({ title: 'Error', description: 'No se pudo guardar', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // Cargar guardado
  const handleLoadSaved = (report: any) => {
    const c = report.filters as ReportConfig;
    if (c && c.sourceId) {
      setConfig(c);
      setResult(null);
      setExecError(null);
      toast({ title: 'Cargado', description: `Reporte "${report.name}" aplicado` });
    }
  };

  // Eliminar guardado
  const handleDeleteSaved = async (reportId: string) => {
    const ok = await reportBuilderService.deleteSavedReport(reportId);
    if (ok && organization?.id) {
      const updated = await reportBuilderService.getSavedReports(organization.id);
      setSavedReports(updated);
      toast({ title: 'Eliminado', description: 'Reporte eliminado' });
    }
  };

  // Importar JSON
  const handleImportJSON = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as ReportConfig;
        if (parsed.sourceId) {
          setConfig(parsed);
          setResult(null);
          setExecError(null);
          toast({ title: 'Importado', description: 'Configuración cargada desde JSON' });
        }
      } catch {
        toast({ title: 'Error', description: 'JSON inválido', variant: 'destructive' });
      }
    };
    input.click();
  };

  // Exportar config JSON
  const handleExportJSON = () => {
    const json = JSON.stringify(config, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte-config-${config.sourceId || 'nuevo'}.json`;
    link.click();
    URL.revokeObjectURL(url);
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
                <Wrench className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Report Builder</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Constructor de reportes personalizados</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" onClick={handleExecute} disabled={!config.sourceId || isExecuting}
                className="bg-blue-600 hover:bg-blue-700 text-white">
                <Play className={cn('h-4 w-4 mr-2', isExecuting && 'animate-pulse')} />
                {isExecuting ? 'Ejecutando...' : 'Ejecutar'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSaveDialogOpen(true)} disabled={!config.sourceId} className="border-gray-300 dark:border-gray-700">
                <Save className="h-4 w-4 mr-2" /> Guardar
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!result} className="border-gray-300 dark:border-gray-700">
                <FileSpreadsheet className="h-4 w-4 mr-2" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportJSON} disabled={!config.sourceId} className="border-gray-300 dark:border-gray-700">
                <Download className="h-4 w-4 mr-2" /> JSON
              </Button>
              <Button variant="outline" size="sm" onClick={handleImportJSON} className="border-gray-300 dark:border-gray-700">
                Importar
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 sm:p-6 space-y-4">
          {/* Reportes guardados */}
          {savedReports.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 print:hidden">
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap flex-shrink-0">Guardados:</span>
              {savedReports.map((r) => (
                <div key={r.id} className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => handleLoadSaved(r)}
                    className="text-xs px-3 py-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400 transition-colors whitespace-nowrap">
                    {r.name}
                  </button>
                  <button onClick={() => handleDeleteSaved(r.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 1. Fuente */}
          <SourceSelector selectedSourceId={config.sourceId} onSelect={handleSourceChange} />

          {/* Solo mostrar el resto si hay fuente seleccionada */}
          {source && (
            <>
              {/* 2. Columnas */}
              <ColumnSelector
                availableColumns={source.columns}
                selectedColumns={config.columns}
                onColumnsChange={(columns) => setConfig((p) => ({ ...p, columns }))}
              />

              {/* 3. Filtros */}
              <FilterBuilder
                availableColumns={source.columns}
                filters={config.filters}
                onFiltersChange={(filters) => setConfig((p) => ({ ...p, filters }))}
                dateFrom={config.dateFrom}
                dateTo={config.dateTo}
                onDateFromChange={(v) => setConfig((p) => ({ ...p, dateFrom: v }))}
                onDateToChange={(v) => setConfig((p) => ({ ...p, dateTo: v }))}
              />

              {/* 4. Agrupación */}
              <GroupBySelector
                availableColumns={source.columns}
                groupBy={config.groupBy}
                metric={config.metric}
                metricColumn={config.metricColumn}
                onGroupByChange={(v) => setConfig((p) => ({ ...p, groupBy: v }))}
                onMetricChange={(v) => setConfig((p) => ({ ...p, metric: v }))}
                onMetricColumnChange={(v) => setConfig((p) => ({ ...p, metricColumn: v }))}
              />

              {/* Límite */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-500 dark:text-gray-400">Límite de registros:</label>
                <Input type="number" value={config.limit} onChange={(e) => setConfig((p) => ({ ...p, limit: Math.min(1000, Math.max(1, Number(e.target.value) || 100)) }))}
                  className="h-8 w-24 text-xs bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600" min={1} max={1000} />
              </div>
            </>
          )}

          {/* 5. Resultados */}
          <ResultsPreview result={result} isLoading={isExecuting} error={execError} />
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
                placeholder="Ej: Ventas por sucursal Q1"
                className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600" />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Se guardará la configuración completa (fuente, columnas, filtros, agrupación).</p>
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
