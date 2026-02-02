'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Settings } from 'lucide-react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import {
  CalendarSettingsForm,
  useCalendarSettings,
} from '@/components/calendario/configuracion';

export default function ConfiguracionCalendarioPage() {
  const { organization } = useOrganization();
  const organizationId = organization?.id || null;
  const { toast } = useToast();

  const {
    settings,
    isLoading,
    isSaving,
    hasChanges,
    updateSettings,
    saveSettings,
    resetToDefaults,
  } = useCalendarSettings({ organizationId });

  const handleSave = useCallback(async () => {
    const result = await saveSettings();
    
    if (result.success) {
      toast({
        title: 'Configuración guardada',
        description: 'Los cambios se han guardado correctamente.',
      });
    } else {
      toast({
        title: 'Error',
        description: result.error || 'No se pudo guardar la configuración.',
        variant: 'destructive',
      });
    }
  }, [saveSettings, toast]);

  const handleReset = useCallback(() => {
    resetToDefaults();
    toast({
      title: 'Configuración restaurada',
      description: 'Se han restaurado los valores predeterminados. Recuerda guardar los cambios.',
    });
  }, [resetToDefaults, toast]);

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Settings className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Configuración del Calendario
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Personaliza las preferencias del calendario para tu organización
                </p>
              </div>
            </div>
            <Link href="/app/calendario">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Calendario
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="p-6 max-w-4xl mx-auto">
        <CalendarSettingsForm
          settings={settings}
          isLoading={isLoading}
          isSaving={isSaving}
          hasChanges={hasChanges}
          onUpdate={updateSettings}
          onSave={handleSave}
          onReset={handleReset}
        />
      </div>
    </div>
  );
}
