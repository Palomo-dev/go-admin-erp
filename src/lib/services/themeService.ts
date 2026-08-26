'use client';

import { supabase } from '@/lib/supabase/config';
import { getMobileStorage, setMobileStorage } from '@/lib/utils/mobileStorage';

const STORAGE_KEY = 'theme';

type Theme = 'light' | 'dark' | 'system';

/**
 * Cache en memoria del tema local.
 *
 * Permite que getLocalTheme/setLocalTheme sigan siendo síncronos mientras
 * el almacenamiento real (localStorage en web, @capacitor/preferences en
 * móvil) se carga/ persiste de forma asíncrona.
 */
let themeCache: Theme | null | undefined = undefined;

/**
 * Servicio de tema con persistencia híbrida:
 * - localStorage / @capacitor/preferences para respuesta inmediata (cache en memoria)
 * - profiles.metadata.theme_preference para persistencia entre dispositivos
 */
export const themeService = {
  /**
   * Carga el tema desde el almacenamiento persistente al cache en memoria.
   * Debe llamarse al inicio (en un useEffect) antes de usar getLocalTheme.
   */
  async initThemeCache(): Promise<void> {
    if (themeCache !== undefined) return; // ya inicializado
    const saved = await getMobileStorage(STORAGE_KEY);
    themeCache = saved as Theme | null;
  },

  /**
   * Obtiene el tema guardado (respuesta inmediata desde cache en memoria).
   * Si el cache no se ha inicializado, intenta leer de localStorage como fallback.
   */
  getLocalTheme(): Theme | null {
    if (themeCache !== undefined) return themeCache;
    // Fallback síncrono: localStorage (web/desktop)
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
      themeCache = saved;
      return saved;
    }
    return null;
  },

  /**
   * Guarda el tema en cache en memoria (síncrono) y lo persiste async.
   */
  setLocalTheme(theme: Theme): void {
    themeCache = theme;
    // Persistencia asíncrona (fire and forget)
    void setMobileStorage(STORAGE_KEY, theme);
    // También escribir síncrono en localStorage como fallback en web
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        // noop
      }
    }
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
   * Sincroniza el tema: lee de Supabase y actualiza el almacenamiento local si hay diferencia.
   * Retorna el tema que debería aplicar.
   */
  async syncTheme(): Promise<Theme> {
    // Asegurar que el cache en memoria esté cargado
    await this.initThemeCache();

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
