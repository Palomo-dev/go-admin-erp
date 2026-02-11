import { supabase } from '@/lib/supabase/config';
import type { UserNotificationPreference, PreferenceUpdate } from './types';
import { DEFAULT_CHANNELS } from './types';

export const PreferenciasService = {
  // ── Obtener preferencias del usuario ──────────────────
  async getPreferences(userId: string): Promise<UserNotificationPreference[]> {
    const { data, error } = await supabase
      .from('user_notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .order('channel');

    if (error) {
      console.error('Error fetching preferences:', error);
      return [];
    }

    return (data as UserNotificationPreference[]) || [];
  },

  // ── Asegurar que existan registros para todos los canales ─
  async ensureAllChannels(userId: string): Promise<UserNotificationPreference[]> {
    const existing = await this.getPreferences(userId);
    const existingChannels = existing.map((p) => p.channel);
    const missing = DEFAULT_CHANNELS.filter((ch) => !existingChannels.includes(ch));

    if (missing.length > 0) {
      // Insertar uno por uno para evitar que un fallo bloquee todos
      for (const channel of missing) {
        const { error } = await supabase
          .from('user_notification_preferences')
          .upsert({
            user_id: userId,
            channel,
            mute: false,
            allowed_types: [],
            dnd_start: null,
            dnd_end: null,
          }, { onConflict: 'user_id,channel' });

        if (error) {
          console.error(`Error seeding preference for channel "${channel}":`, error);
        }
      }

      return this.getPreferences(userId);
    }

    return existing;
  },

  // ── Actualizar preferencia de un canal ────────────────
  async updatePreference(
    userId: string,
    channel: string,
    updates: PreferenceUpdate,
  ): Promise<boolean> {
    const { error } = await supabase
      .from('user_notification_preferences')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('channel', channel);

    if (error) {
      console.error('Error updating preference:', error);
      return false;
    }
    return true;
  },

  // ── Silenciar todos los canales ───────────────────────
  async muteAll(userId: string, mute: boolean): Promise<boolean> {
    const { error } = await supabase
      .from('user_notification_preferences')
      .update({ mute, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (error) {
      console.error('Error muting all:', error);
      return false;
    }
    return true;
  },

  // ── Aplicar DND a todos los canales ───────────────────
  async setGlobalDND(
    userId: string,
    dndStart: string | null,
    dndEnd: string | null,
  ): Promise<boolean> {
    const { error } = await supabase
      .from('user_notification_preferences')
      .update({
        dnd_start: dndStart,
        dnd_end: dndEnd,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) {
      console.error('Error setting global DND:', error);
      return false;
    }
    return true;
  },

  // ── Restablecer valores por defecto ───────────────────
  async resetToDefaults(userId: string): Promise<boolean> {
    const { error } = await supabase
      .from('user_notification_preferences')
      .update({
        mute: false,
        allowed_types: [],
        dnd_start: null,
        dnd_end: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) {
      console.error('Error resetting preferences:', error);
      return false;
    }
    return true;
  },
};
