'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import PMSSettingsService, { type PMSSettings } from '@/lib/services/pmsSettingsService';
import {
  GeneralSettings,
  ReservationSettings,
  NotificationSettings,
  CheckinCheckoutSettings,
  OperationsSettings,
} from '@/components/pms/configuracion';
import { Button } from '@/components/ui/button';
import { RefreshCw, Save } from 'lucide-react';
import { PageHeaderSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';

export function PMSConfigPanel() {
  const { organization } = useOrganization();
  const { toast } = useToast();

  const [settings, setSettings] = useState<PMSSettings | null>(null);
  const [originalSettings, setOriginalSettings] = useState<PMSSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const timezones = PMSSettingsService.getTimezones();
  const currencies = PMSSettingsService.getCurrencies();

  const loadSettings = useCallback(async () => {
    if (!organization?.id) return;

    try {
      const data = await PMSSettingsService.getSettings(organization.id);
      setSettings(data);
      setOriginalSettings(data);
    } catch (error) {
      console.error('Error loading settings:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar las configuraciones', variant: 'destructive' });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [organization?.id, toast]);

  useEffect(() => {
    if (organization?.id) loadSettings();
  }, [organization?.id, loadSettings]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadSettings();
    toast({ title: 'Actualizado', description: 'Las configuraciones han sido recargadas' });
  };

  const handleChange = (key: keyof PMSSettings, value: unknown) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  };

  const handleSave = async () => {
    if (!organization?.id || !settings) return;

    setIsSaving(true);
    try {
      await PMSSettingsService.saveSettings(organization.id, settings);
      setOriginalSettings(settings);
      toast({ title: 'Guardado', description: 'Las configuraciones han sido guardadas correctamente' });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({ title: 'Error', description: 'No se pudieron guardar las configuraciones', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = settings && originalSettings
    ? JSON.stringify(settings) !== JSON.stringify(originalSettings)
    : false;

  if (isLoading || !settings) {
    return (
      <div className="space-y-6">
        <PageHeaderSkeleton />
        <CardListSkeleton cards={4} columns="2" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
        <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GeneralSettings settings={settings} onChange={handleChange} timezones={timezones} currencies={currencies} />
        <ReservationSettings settings={settings} onChange={handleChange} />
        <NotificationSettings settings={settings} onChange={handleChange} />
        <CheckinCheckoutSettings settings={settings} onChange={handleChange} />
        <OperationsSettings settings={settings} onChange={handleChange} />
      </div>
    </div>
  );
}
