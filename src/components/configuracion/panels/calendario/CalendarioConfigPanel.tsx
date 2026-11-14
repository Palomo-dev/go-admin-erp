'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { CalendarSettingsForm, useCalendarSettings } from '@/components/calendario/configuracion';

export function CalendarioConfigPanel() {
  const { organization } = useOrganization();
  const organizationId = organization?.id || null;
  const { toast } = useToast();
  const t = useTranslations('configuracionTextos.calendarioConfigPanel');

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
      toast({ title: t('guardada.titulo'), description: t('guardada.descripcion') });
    } else {
      toast({ title: t('error'), description: result.error || t('errorGuardar'), variant: 'destructive' });
    }
  }, [saveSettings, toast, t]);

  const handleReset = useCallback(() => {
    resetToDefaults();
    toast({ title: t('restaurada.titulo'), description: t('restaurada.descripcion') });
  }, [resetToDefaults, toast, t]);

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
