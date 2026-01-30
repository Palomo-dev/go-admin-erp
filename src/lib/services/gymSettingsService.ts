'use client';

import { supabase } from '@/lib/supabase/config';

// Interfaz para configuración del gimnasio
export interface GymSettings {
  accessRules: {
    requireActiveMembreship: boolean;
    allowGuestAccess: boolean;
    maxDailyCheckins: number;
    allowMultipleCheckinsPerDay: boolean;
    requirePhotoVerification: boolean;
    blockExpiredMembers: boolean;
  };
  tolerance: {
    earlyCheckinMinutes: number;
    lateCheckinMinutes: number;
    gracePeroidDays: number;
    expirationWarningDays: number;
  };
  checkinMethods: {
    qrCode: boolean;
    manualSearch: boolean;
    fingerprint: boolean;
    cardReader: boolean;
    faceRecognition: boolean;
  };
  messages: {
    welcomeMessage: string;
    expiredMessage: string;
    blockedMessage: string;
    renewalReminder: string;
  };
  classRules: {
    maxReservationsPerWeek: number;
    cancellationHoursLimit: number;
    noShowPenaltyDays: number;
    waitlistEnabled: boolean;
    autoConfirmReservations: boolean;
  };
  notifications: {
    sendExpirationReminder: boolean;
    sendCheckinConfirmation: boolean;
    sendClassReminder: boolean;
    reminderHoursBefore: number;
  };
}

// Valores por defecto
export const defaultGymSettings: GymSettings = {
  accessRules: {
    requireActiveMembreship: true,
    allowGuestAccess: false,
    maxDailyCheckins: 1,
    allowMultipleCheckinsPerDay: false,
    requirePhotoVerification: false,
    blockExpiredMembers: true,
  },
  tolerance: {
    earlyCheckinMinutes: 30,
    lateCheckinMinutes: 15,
    gracePeroidDays: 3,
    expirationWarningDays: 7,
  },
  checkinMethods: {
    qrCode: true,
    manualSearch: true,
    fingerprint: false,
    cardReader: false,
    faceRecognition: false,
  },
  messages: {
    welcomeMessage: '¡Bienvenido! Tu acceso ha sido registrado.',
    expiredMessage: 'Tu membresía ha expirado. Por favor, renuévala en recepción.',
    blockedMessage: 'Tu acceso está bloqueado. Contacta al administrador.',
    renewalReminder: 'Tu membresía está próxima a vencer. ¡Renuévala ahora!',
  },
  classRules: {
    maxReservationsPerWeek: 5,
    cancellationHoursLimit: 2,
    noShowPenaltyDays: 7,
    waitlistEnabled: true,
    autoConfirmReservations: true,
  },
  notifications: {
    sendExpirationReminder: true,
    sendCheckinConfirmation: false,
    sendClassReminder: true,
    reminderHoursBefore: 24,
  },
};

// Obtener configuración del gimnasio
export async function getGymSettings(organizationId: number): Promise<GymSettings> {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('settings')
      .eq('organization_id', organizationId)
      .eq('key', 'gym_settings')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No existe, retornar valores por defecto
        return defaultGymSettings;
      }
      throw error;
    }

    return {
      ...defaultGymSettings,
      ...data.settings,
    };
  } catch (error) {
    console.error('Error obteniendo configuración del gimnasio:', error);
    return defaultGymSettings;
  }
}

// Guardar configuración del gimnasio
export async function saveGymSettings(
  organizationId: number,
  settings: GymSettings
): Promise<void> {
  try {
    // Intentar actualizar primero
    const { data: existing } = await supabase
      .from('settings')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('key', 'gym_settings')
      .single();

    if (existing) {
      // Actualizar existente
      const { error } = await supabase
        .from('settings')
        .update({
          settings,
          updated_at: new Date().toISOString(),
        })
        .eq('organization_id', organizationId)
        .eq('key', 'gym_settings');

      if (error) throw error;
    } else {
      // Crear nuevo
      const { error } = await supabase.from('settings').insert({
        organization_id: organizationId,
        key: 'gym_settings',
        settings,
      });

      if (error) throw error;
    }
  } catch (error) {
    console.error('Error guardando configuración del gimnasio:', error);
    throw error;
  }
}

// Actualizar una sección específica de la configuración
export async function updateGymSettingsSection<K extends keyof GymSettings>(
  organizationId: number,
  section: K,
  values: Partial<GymSettings[K]>
): Promise<void> {
  try {
    const currentSettings = await getGymSettings(organizationId);
    const updatedSettings = {
      ...currentSettings,
      [section]: {
        ...currentSettings[section],
        ...values,
      },
    };
    await saveGymSettings(organizationId, updatedSettings);
  } catch (error) {
    console.error(`Error actualizando sección ${section}:`, error);
    throw error;
  }
}

// Resetear configuración a valores por defecto
export async function resetGymSettings(organizationId: number): Promise<void> {
  await saveGymSettings(organizationId, defaultGymSettings);
}

export default {
  getGymSettings,
  saveGymSettings,
  updateGymSettingsSection,
  resetGymSettings,
  defaultGymSettings,
};
