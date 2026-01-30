'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import PMSSettingsService, { type PMSSettings } from '@/lib/services/pmsSettingsService';
import {
  SettingsHeader,
  GeneralSettings,
  ReservationSettings,
  NotificationSettings,
  CheckinCheckoutSettings,
  OperationsSettings,
} from '@/components/pms/configuracion';

export default function ConfiguracionPage() {
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
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las configuraciones',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [organization?.id, toast]);

  useEffect(() => {
    if (organization?.id) {
      loadSettings();
    }
  }, [organization?.id, loadSettings]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadSettings();
    toast({
      title: 'Actualizado',
      description: 'Las configuraciones han sido recargadas',
    });
  };

  const handleChange = (key: keyof PMSSettings, value: any) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  };

  const handleSave = async () => {
    if (!organization?.id || !settings) return;

    setIsSaving(true);
    try {
      await PMSSettingsService.saveSettings(organization.id, settings);
      setOriginalSettings(settings);
      toast({
        title: 'Guardado',
        description: 'Las configuraciones han sido guardadas correctamente',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron guardar las configuraciones',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = settings && originalSettings 
    ? JSON.stringify(settings) !== JSON.stringify(originalSettings)
    : false;

  if (isLoading || !settings) {
    return (
      <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="animate-pulse space-y-6">
            <div className="h-16 bg-gray-200 dark:bg-gray-800 rounded-lg" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="h-64 bg-gray-200 dark:bg-gray-800 rounded-lg" />
              <div className="h-64 bg-gray-200 dark:bg-gray-800 rounded-lg" />
              <div className="h-64 bg-gray-200 dark:bg-gray-800 rounded-lg" />
              <div className="h-64 bg-gray-200 dark:bg-gray-800 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <SettingsHeader
          onSave={handleSave}
          onRefresh={handleRefresh}
          isSaving={isSaving}
          isRefreshing={isRefreshing}
          hasChanges={hasChanges}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GeneralSettings
            settings={settings}
            onChange={handleChange}
            timezones={timezones}
            currencies={currencies}
          />

          <ReservationSettings
            settings={settings}
            onChange={handleChange}
          />

          <NotificationSettings
            settings={settings}
            onChange={handleChange}
          />

          <CheckinCheckoutSettings
            settings={settings}
            onChange={handleChange}
          />

          <OperationsSettings
            settings={settings}
            onChange={handleChange}
          />
        </div>
      </div>
    </div>
  );
}
