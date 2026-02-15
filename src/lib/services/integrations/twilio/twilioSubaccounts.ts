/**
 * Twilio Subaccounts — Gestión de subcuentas por organización
 * GO Admin ERP
 *
 * Cada organización tiene su propia subcuenta Twilio,
 * lo que permite aislamiento de recursos y facturación separada.
 */

import { supabase } from '@/lib/supabase/config';
import { getMasterClient } from './twilioConfig';
import type { TwilioSubaccount, CommSettings } from './twilioTypes';
import { TwilioConfigError } from './twilioTypes';

/**
 * Crea una subcuenta Twilio para una organización.
 * Si ya existe, retorna la existente.
 */
export async function getOrCreateSubaccount(
  orgId: number,
  orgName: string
): Promise<TwilioSubaccount> {
  // 1. Verificar si ya existe en comm_settings
  const { data: existing } = await supabase
    .from('comm_settings')
    .select('twilio_subaccount_sid, twilio_subaccount_auth_token')
    .eq('organization_id', orgId)
    .single();

  if (existing?.twilio_subaccount_sid && existing?.twilio_subaccount_auth_token) {
    return {
      sid: existing.twilio_subaccount_sid,
      authToken: existing.twilio_subaccount_auth_token,
      friendlyName: `GO Admin - ${orgName}`,
      status: 'active',
    };
  }

  // 2. Crear subcuenta en Twilio
  const masterClient = getMasterClient();
  const subaccount = await masterClient.api.accounts.create({
    friendlyName: `GO Admin - ${orgName}`,
  });

  // 3. Guardar en comm_settings
  const { error } = await supabase
    .from('comm_settings')
    .upsert(
      {
        organization_id: orgId,
        twilio_subaccount_sid: subaccount.sid,
        twilio_subaccount_auth_token: subaccount.authToken,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' }
    );

  if (error) {
    console.error('Error guardando subcuenta Twilio:', error);
    throw new TwilioConfigError(`Error guardando subcuenta: ${error.message}`);
  }

  return {
    sid: subaccount.sid,
    authToken: subaccount.authToken,
    friendlyName: subaccount.friendlyName,
    status: subaccount.status,
  };
}

/**
 * Obtiene la configuración de comunicaciones de una organización.
 */
export async function getCommSettings(orgId: number): Promise<CommSettings | null> {
  const { data, error } = await supabase
    .from('comm_settings')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return null;
  }

  return data as CommSettings;
}

/**
 * Suspende la subcuenta Twilio de una organización.
 */
export async function suspendSubaccount(orgId: number): Promise<void> {
  const settings = await getCommSettings(orgId);
  if (!settings?.twilio_subaccount_sid) return;

  const masterClient = getMasterClient();
  await masterClient.api
    .accounts(settings.twilio_subaccount_sid)
    .update({ status: 'suspended' });

  await supabase
    .from('comm_settings')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('organization_id', orgId);
}

/**
 * Reactiva la subcuenta Twilio de una organización.
 */
export async function reactivateSubaccount(orgId: number): Promise<void> {
  const settings = await getCommSettings(orgId);
  if (!settings?.twilio_subaccount_sid) return;

  const masterClient = getMasterClient();
  await masterClient.api
    .accounts(settings.twilio_subaccount_sid)
    .update({ status: 'active' });

  await supabase
    .from('comm_settings')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('organization_id', orgId);
}
