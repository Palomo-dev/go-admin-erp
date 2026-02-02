'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/config';
import { CalendarSettings, DEFAULT_CALENDAR_SETTINGS } from './types';

interface UseCalendarSettingsProps {
  organizationId: number | null;
  userId?: string | null;
}

interface UseCalendarSettingsReturn {
  settings: CalendarSettings;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  updateSettings: (updates: Partial<CalendarSettings>) => void;
  saveSettings: () => Promise<{ success: boolean; error: string | null }>;
  resetToDefaults: () => void;
  hasChanges: boolean;
}

export function useCalendarSettings({
  organizationId,
  userId,
}: UseCalendarSettingsProps): UseCalendarSettingsReturn {
  const [settings, setSettings] = useState<CalendarSettings>(DEFAULT_CALENDAR_SETTINGS);
  const [originalSettings, setOriginalSettings] = useState<CalendarSettings>(DEFAULT_CALENDAR_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar configuración
  const fetchSettings = useCallback(async () => {
    if (!organizationId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Buscar configuración de la organización
      const { data, error: queryError } = await supabase
        .from('organization_settings')
        .select('settings')
        .eq('organization_id', organizationId)
        .eq('key', 'calendar')
        .single();

      if (queryError && queryError.code !== 'PGRST116') {
        throw queryError;
      }

      if (data?.settings) {
        const mergedSettings = {
          ...DEFAULT_CALENDAR_SETTINGS,
          ...data.settings,
        };
        setSettings(mergedSettings);
        setOriginalSettings(mergedSettings);
      } else {
        setSettings(DEFAULT_CALENDAR_SETTINGS);
        setOriginalSettings(DEFAULT_CALENDAR_SETTINGS);
      }
    } catch (err) {
      console.error('Error fetching calendar settings:', err);
      setError('No se pudo cargar la configuración');
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Actualizar configuración local
  const updateSettings = useCallback((updates: Partial<CalendarSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  // Guardar configuración
  const saveSettings = useCallback(async () => {
    if (!organizationId) {
      return { success: false, error: 'No hay organización seleccionada' };
    }

    setIsSaving(true);
    setError(null);

    try {
      // Verificar si ya existe la configuración
      const { data: existing } = await supabase
        .from('organization_settings')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('key', 'calendar')
        .single();

      if (existing) {
        // Actualizar
        const { error: updateError } = await supabase
          .from('organization_settings')
          .update({
            settings,
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', organizationId)
          .eq('key', 'calendar');

        if (updateError) throw updateError;
      } else {
        // Insertar
        const { error: insertError } = await supabase
          .from('organization_settings')
          .insert({
            organization_id: organizationId,
            key: 'calendar',
            settings,
          });

        if (insertError) throw insertError;
      }

      setOriginalSettings(settings);
      return { success: true, error: null };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al guardar';
      console.error('Error saving calendar settings:', err);
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsSaving(false);
    }
  }, [organizationId, settings]);

  // Restaurar valores predeterminados
  const resetToDefaults = useCallback(() => {
    setSettings(DEFAULT_CALENDAR_SETTINGS);
  }, []);

  // Verificar si hay cambios
  const hasChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings);

  return {
    settings,
    isLoading,
    isSaving,
    error,
    updateSettings,
    saveSettings,
    resetToDefaults,
    hasChanges,
  };
}
