'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import {
  integrationsService,
  IntegrationSettings,
  IntegrationModuleStats,
} from '@/lib/services/integrationsService';
import {
  ConfigHeader,
  ModuleStats,
  SettingsForm,
  DocumentationSection,
} from '@/components/integraciones/configuracion';
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
import { contarCambios, useRegistrarCambios } from '../../dialogo/cambiosSinGuardar';

export function IntegracionesConfigPanel() {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const t = useTranslations('configuracionTextos.integracionesConfigPanel');

  const [settings, setSettings] = useState<IntegrationSettings | null>(null);
  const [originalSettings, setOriginalSettings] = useState<IntegrationSettings | null>(null);
  const [stats, setStats] = useState<IntegrationModuleStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const hasChanges = settings && originalSettings
    ? JSON.stringify(settings) !== JSON.stringify(originalSettings)
    : false;

  const loadData = useCallback(async () => {
    if (!organization?.id) return;
    try {
      const [settingsData, statsData] = await Promise.all([
        integrationsService.getIntegrationSettings(organization.id),
        integrationsService.getModuleStats(organization.id),
      ]);
      setSettings(settingsData);
      setOriginalSettings(settingsData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading configuration:', error);
      toast({ variant: 'destructive', title: t('error'), description: t('errorCargar') });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organization?.id, toast, t]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = () => { setRefreshing(true); loadData(); };
  const handleSettingsChange = (newSettings: IntegrationSettings) => setSettings(newSettings);

  const handleSave = async () => {
    if (!organization?.id || !settings) return;
    setSaving(true);
    try {
      const success = await integrationsService.updateIntegrationSettings(organization.id, settings);
      if (success) {
        setOriginalSettings(settings);
        toast({ title: t('guardada.titulo'), description: t('guardada.descripcion') });
      } else {
        toast({ variant: 'destructive', title: t('error'), description: t('errorGuardar') });
      }
    } finally {
      setSaving(false);
    }
  };

  // Barra «cambios sin guardar» del diálogo de Configuración.
  useRegistrarCambios({
    cambios: hasChanges ? contarCambios(settings, originalSettings) : 0,
    guardando: saving,
    guardar: handleSave,
    descartar: () => setSettings(originalSettings),
  });

  const confirmReset = async () => {
    if (!organization?.id) return;
    try {
      const success = await integrationsService.resetIntegrationSettings(organization.id);
      if (success) {
        toast({ title: t('restaurada.titulo'), description: t('restaurada.descripcion') });
        loadData();
      } else {
        toast({ variant: 'destructive', title: t('error'), description: t('errorRestaurar') });
      }
    } finally {
      setResetDialogOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 animate-pulse">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-4" />
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((j) => (
                <div key={j} className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ConfigHeader onRefresh={handleRefresh} onReset={() => setResetDialogOpen(true)} refreshing={refreshing} />

      <ModuleStats stats={stats} loading={refreshing} />

      {settings && (
        <SettingsForm
          settings={settings}
          onChange={handleSettingsChange}
          onSave={handleSave}
          saving={saving}
          hasChanges={hasChanges}
        />
      )}

      <DocumentationSection />

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent className="dark:bg-gray-900 dark:border-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">{t('dialogoRestaurar.titulo')}</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              {t('dialogoRestaurar.descripcion')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-gray-700 dark:text-gray-300">{t('dialogoRestaurar.cancelar')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReset} className="bg-orange-600 hover:bg-orange-700 text-white">{t('dialogoRestaurar.confirmar')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
