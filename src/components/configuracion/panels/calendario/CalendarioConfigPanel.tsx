'use client';

import { useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { CalendarSettingsForm, useCalendarSettings } from '@/components/calendario/configuracion';

export function CalendarioConfigPanel() {
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
      toast({ title: 'Configuración guardada', description: 'Los cambios se han guardado correctamente.' });
    } else {
      toast({ title: 'Error', description: result.error || 'No se pudo guardar la configuración.', variant: 'destructive' });
    }
  }, [saveSettings, toast]);

  const handleReset = useCallback(() => {
    resetToDefaults();
    toast({ title: 'Configuración restaurada', description: 'Se han restaurado los valores predeterminados. Recuerda guardar los cambios.' });
  }, [resetToDefaults, toast]);

  return (
    <div className="max-w-4xl mx-auto">
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
  );
}
