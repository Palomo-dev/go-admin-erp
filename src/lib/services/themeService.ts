'use client';

import { supabase } from '@/lib/supabase/config';

const STORAGE_KEY = 'theme';

type Theme = 'light' | 'dark' | 'system';

/**
 * Servicio de tema con persistencia híbrida:
 * - localStorage para respuesta inmediata
 * - profiles.metadata.theme_preference para persistencia entre dispositivos
 */
export const themeService = {
  /**
   * Obtiene el tema guardado en localStorage (respuesta inmediata)
   */
  getLocalTheme(): Theme | null {
    if (typeof window === 'undefined') return null;
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    return saved;
  },

  /**
   * Guarda el tema en localStorage
   */
  setLocalTheme(theme: Theme): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, theme);
  },

  /**
   * Lee el tema desde profiles.metadata para el usuario autenticado
   */
  async getRemoteTheme(): Promise<Theme | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('metadata')
        .eq('id', session.user.id)
        .single();

      if (error || !data?.metadata) return null;

      const themePref = (data.metadata as Record<string, any>)?.theme_preference as Theme | undefined;
      return themePref || null;
    } catch {
      return null;
    }
  },

  /**
   * Guarda el tema en profiles.metadata para el usuario autenticado
   */
  async setRemoteTheme(theme: Theme): Promise<void> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;

      // Primero leer el metadata actual para no sobrescribir otros campos
      const { data: profile } = await supabase
        .from('profiles')
        .select('metadata')
        .eq('id', session.user.id)
        .single();

      const currentMetadata = (profile?.metadata as Record<string, any>) || {};

      await supabase
        .from('profiles')
        .update({
          metadata: {
            ...currentMetadata,
            theme_preference: theme,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.user.id);
    } catch (error) {
      console.error('Error guardando tema en perfil:', error);
    }
  },

  /**
   * Sincroniza el tema: lee de Supabase y actualiza localStorage si hay diferencia.
   * Retorna el tema que debería aplicar.
   */
  async syncTheme(): Promise<Theme> {
    const localTheme = this.getLocalTheme();
    const remoteTheme = await this.getRemoteTheme();

    // Si hay tema remoto y difiere del local, usar el remoto (preferencia entre dispositivos)
    if (remoteTheme && remoteTheme !== localTheme) {
      this.setLocalTheme(remoteTheme);
      return remoteTheme;
    }

    // Si hay tema local, usarlo
    if (localTheme) return localTheme;

    // Si no hay nada, usar preferencia del sistema
    if (typeof window !== 'undefined') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const systemTheme: Theme = prefersDark ? 'dark' : 'light';
      this.setLocalTheme(systemTheme);
      return systemTheme;
    }

    return 'light';
  },
};
