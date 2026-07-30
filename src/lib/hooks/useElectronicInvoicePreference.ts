'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

/**
 * Hook que lee la preferencia global de facturación electrónica
 * desde organization_preferences.settings.electronic_invoicing.always_enabled
 *
 * Si always_enabled es true, todos los componentes que tienen toggle de
 * factura electrónica deben inicializar sendToFactus = true.
 */
export function useElectronicInvoicePreference() {
  const orgId = getOrganizationId();
  const [alwaysEnabled, setAlwaysEnabled] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const loadPreference = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('organization_preferences')
        .select('settings')
        .eq('organization_id', orgId)
        .maybeSingle();

      if (error) {
        console.error('Error loading e-invoice preference:', error);
        return;
      }

      const enabled = data?.settings?.electronic_invoicing?.always_enabled ?? false;
      setAlwaysEnabled(enabled);
    } catch (err) {
      console.error('Error reading e-invoice preference:', err);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadPreference();
  }, [loadPreference]);

  const savePreference = useCallback(async (enabled: boolean) => {
    if (!orgId) return { success: false, error: 'Sin organización' };

    try {
      const { data: existing, error: fetchError } = await supabase
        .from('organization_preferences')
        .select('settings')
        .eq('organization_id', orgId)
        .maybeSingle();

      if (fetchError && fetchError.code !== 'PGRST116') {
        return { success: false, error: fetchError.message };
      }

      const currentSettings = existing?.settings || {};
      const newSettings = {
        ...currentSettings,
        electronic_invoicing: {
          ...(currentSettings.electronic_invoicing || {}),
          always_enabled: enabled,
        },
      };

      const { error: upsertError } = await supabase
        .from('organization_preferences')
        .upsert(
          { organization_id: orgId, settings: newSettings },
          { onConflict: 'organization_id' }
        );

      if (upsertError) {
        return { success: false, error: upsertError.message };
      }

      setAlwaysEnabled(enabled);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [orgId]);

  return { alwaysEnabled, loading, savePreference, reload: loadPreference };
}
