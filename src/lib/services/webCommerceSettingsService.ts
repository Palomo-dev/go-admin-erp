// ============================================================
// Servicio para la configuración de comercio web por organización.
//
// Almacena preferencias en `organization_settings` (clave 'web_commerce')
// usando el patrón upsert ya establecido en el proyecto (POS, calendario,
// PMS). Hoy expone:
//   - order_expiration_minutes: tiempo de expiración de pedidos pendientes
//     (default 30 min; el cron lo lee por organización).
//
// No toca el esquema: reutiliza la tabla `organization_settings` existente.
// ============================================================

import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export interface WebCommerceSettings {
  /** Minutos antes de expirar un pedido pendiente (default 30). */
  order_expiration_minutes: number;
}

export const DEFAULT_WEB_COMMERCE_SETTINGS: WebCommerceSettings = {
  order_expiration_minutes: 30,
};

const SETTING_KEY = 'web_commerce';

export const webCommerceSettingsService = {
  /**
   * Obtiene la configuración de comercio web de la organización actual.
   * Mezcla con defaults para que falten claves no rompa nada.
   */
  async getSettings(): Promise<WebCommerceSettings> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('organization_settings')
      .select('settings')
      .eq('organization_id', orgId)
      .eq('key', SETTING_KEY)
      .maybeSingle();

    if (error) {
      console.error('[webCommerceSettings] Error leyendo settings:', error);
      return { ...DEFAULT_WEB_COMMERCE_SETTINGS };
    }

    const stored = (data?.settings || {}) as Partial<WebCommerceSettings>;
    return {
      order_expiration_minutes:
        typeof stored.order_expiration_minutes === 'number' && stored.order_expiration_minutes > 0
          ? stored.order_expiration_minutes
          : DEFAULT_WEB_COMMERCE_SETTINGS.order_expiration_minutes,
    };
  },

  /**
   * Guarda (merge) la configuración de comercio web.
   */
  async saveSettings(partial: Partial<WebCommerceSettings>): Promise<void> {
    const orgId = getOrganizationId();
    const current = await this.getSettings();
    const merged: WebCommerceSettings = { ...current, ...partial };

    const { error } = await supabase
      .from('organization_settings')
      .upsert(
        {
          organization_id: orgId,
          key: SETTING_KEY,
          settings: merged,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,key' }
      );

    if (error) throw error;
  },
};
