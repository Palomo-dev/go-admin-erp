'use client';

import React, { useState, useEffect, useCallback } from 'react';
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

export default function ConfiguracionPage() {
  const { organization } = useOrganization();
  const { toast } = useToast();

  // Estados principales
  const [settings, setSettings] = useState<IntegrationSettings | null>(null);
  const [originalSettings, setOriginalSettings] = useState<IntegrationSettings | null>(null);
  const [stats, setStats] = useState<IntegrationModuleStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Dialogs
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  // Detectar cambios
  const hasChanges = settings && originalSettings
    ? JSON.stringify(settings) !== JSON.stringify(originalSettings)
    : false;

  // Cargar datos
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
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo cargar la configuración',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organization?.id, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handlers
  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleSettingsChange = (newSettings: IntegrationSettings) => {
    setSettings(newSettings);
  };

  const handleSave = async () => {
    if (!organization?.id || !settings) return;

    setSaving(true);
    try {
      const success = await integrationsService.updateIntegrationSettings(
        organization.id,
        settings
      );

      if (success) {
        setOriginalSettings(settings);
        toast({
          title: 'Configuración guardada',
          description: 'Los cambios se han aplicado correctamente',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'No se pudo guardar la configuración',
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setResetDialogOpen(true);
  };

  const confirmReset = async () => {
    if (!organization?.id) return;

    try {
      const success = await integrationsService.resetIntegrationSettings(organization.id);

      if (success) {
        toast({
          title: 'Configuración restaurada',
          description: 'Se han aplicado los valores por defecto',
        });
        loadData();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'No se pudo restaurar la configuración',
        });
      }
    } finally {
      setResetDialogOpen(false);
    }
  };

  // Skeleton de carga
  if (loading) {
    return (
      <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950">
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-6">
          <div className="animate-pulse space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-xl" />
              <div className="space-y-2">
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-64" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 p-6 space-y-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 animate-pulse"
            >
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-4" />
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <ConfigHeader
        onRefresh={handleRefresh}
        onReset={handleReset}
        refreshing={refreshing}
      />

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Estadísticas del módulo */}
          <ModuleStats stats={stats} loading={refreshing} />

          {/* Formulario de configuración */}
          {settings && (
            <SettingsForm
              settings={settings}
              onChange={handleSettingsChange}
              onSave={handleSave}
              saving={saving}
              hasChanges={hasChanges}
            />
          )}

          {/* Documentación */}
          <DocumentationSection />
        </div>
      </div>

      {/* Dialog de confirmación de reset */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent className="dark:bg-gray-900 dark:border-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">
              ¿Restaurar configuración por defecto?
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              Esta acción sobrescribirá toda la configuración actual con los valores
              predeterminados del sistema. Los cambios no guardados se perderán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-gray-700 dark:text-gray-300">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReset}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              Restaurar Defaults
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
