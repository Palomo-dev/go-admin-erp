'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/Utils';
import { Save, RotateCcw, RefreshCw, Download, Upload } from 'lucide-react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import timelineSettingsService, { type TimelineSettings } from '@/lib/services/timelineSettingsService';
import {
  PrivacySettings,
  SourcesSettings,
  RetentionSettings,
  PerformanceSettings,
} from '@/components/timeline/configuracion';

export function TimelineConfigPanel() {
  const { toast } = useToast();
  const organizationId = getOrganizationId();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<TimelineSettings | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const availableSources = timelineSettingsService.getAvailableSources();

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await timelineSettingsService.getSettings(organizationId);
      setSettings(data);
      setHasChanges(false);
    } catch (error) {
      console.error('Error loading settings:', error);
      toast({ title: 'Error', description: 'No se pudo cargar la configuración', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [organizationId, toast]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleChange = (key: keyof TimelineSettings, value: unknown) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
    setHasChanges(true);
  };

  const handleSourcesChange = (visibleSources: string[]) => {
    if (!settings) return;
    setSettings({ ...settings, visibleSources });
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!settings) return;
    try {
      setSaving(true);
      await timelineSettingsService.saveSettings(organizationId, settings);
      setHasChanges(false);
      toast({ title: 'Guardado', description: 'La configuración se ha guardado correctamente' });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({ title: 'Error', description: 'No se pudo guardar la configuración', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      setSaving(true);
      const defaultSettings = await timelineSettingsService.resetSettings(organizationId);
      setSettings(defaultSettings);
      setHasChanges(false);
      setResetDialogOpen(false);
      toast({ title: 'Restablecido', description: 'La configuración se ha restablecido a los valores por defecto' });
    } catch (error) {
      console.error('Error resetting settings:', error);
      toast({ title: 'Error', description: 'No se pudo restablecer la configuración', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleExportConfig = () => {
    if (!settings) return;
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timeline-config-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: 'Exportado', description: 'La configuración se ha exportado correctamente' });
  };

  const handleImportConfig = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text) as TimelineSettings;
        setSettings(imported);
        setHasChanges(true);
        toast({ title: 'Importado', description: 'La configuración se ha importado. Guarda para aplicar los cambios.' });
      } catch {
        toast({ title: 'Error', description: 'El archivo no es válido', variant: 'destructive' });
      }
    };
    input.click();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-gray-500 mb-4">No se pudo cargar la configuración</p>
          <Button onClick={loadSettings}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleExportConfig}>
          <Download className="h-4 w-4 mr-1" />
          Exportar
        </Button>
        <Button variant="outline" size="sm" onClick={handleImportConfig}>
          <Upload className="h-4 w-4 mr-1" />
          Importar
        </Button>
        <Button variant="outline" size="sm" onClick={() => setResetDialogOpen(true)}>
          <RotateCcw className="h-4 w-4 mr-1" />
          Restablecer
        </Button>
        <Button onClick={handleSave} disabled={!hasChanges || saving} className={cn('bg-blue-600 hover:bg-blue-700', !hasChanges && 'opacity-50')}>
          {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>

      {hasChanges && (
        <div className="p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <p className="text-xs text-yellow-700 dark:text-yellow-300">
            Tienes cambios sin guardar. Haz clic en &quot;Guardar cambios&quot; para aplicarlos.
          </p>
        </div>
      )}

      <div className="max-w-4xl space-y-6">
        <PrivacySettings settings={settings} onChange={(key, value) => handleChange(key, value)} />
        <SourcesSettings settings={settings} availableSources={availableSources} onChange={handleSourcesChange} />
        <RetentionSettings settings={settings} onChange={(key, value) => handleChange(key, value)} />
        <PerformanceSettings settings={settings} onChange={(key, value) => handleChange(key, value)} />
      </div>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Restablecer configuración?</AlertDialogTitle>
            <AlertDialogDescription>
              Esto restablecerá todas las configuraciones del timeline a sus valores por defecto. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset} className="bg-red-600 hover:bg-red-700">Restablecer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
