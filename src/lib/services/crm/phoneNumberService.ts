/**
 * phoneNumberService — números de la organización y su cableado a Twilio.
 * GO Admin ERP — FASE-03 §4.2 (SOLO servidor).
 *
 * - `importNumbersFromTwilio(orgId)`: lista `incomingPhoneNumbers` de la
 *   (sub)cuenta y hace upsert en `phone_numbers` (provider_sid, capabilities).
 * - `syncNumberWebhooks(orgId, providerSid)`: `voiceUrl → /api/voice/twiml/inbound`,
 *   `statusCallback → /api/voice/status`.
 * - `resolveInboundTargets(orgId, toE164, client)`: identities `<Client>` para
 *   entrantes (asignado → preferencias browser → primer admin).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getTwilioClientForOrg } from './voiceContextService';
import { buildVoiceIdentity } from './voiceTokenService';
import { getTwilioWebhookOrigin } from '@/lib/security/webhookSignatures';

export interface ImportedNumber {
  e164: string;
  provider_sid: string;
  label: string | null;
  capabilities: Record<string, boolean>;
  created: boolean;
}

export async function importNumbersFromTwilio(orgId: number, client?: SupabaseClient): Promise<ImportedNumber[]> {
  const sb = client ?? getServiceClient();
  const { client: twilio } = await getTwilioClientForOrg(orgId);
  const list = await twilio.incomingPhoneNumbers.list({ limit: 100 });
  const result: ImportedNumber[] = [];
  const { data: existing } = await sb.from('phone_numbers').select('id, e164').eq('organization_id', orgId);
  const byE164 = new Map(((existing ?? []) as { id: string; e164: string }[]).map((r) => [r.e164, r.id]));

  for (const n of list) {
    const e164 = n.phoneNumber;
    if (!e164) continue;
    const caps = {
      voice: Boolean(n.capabilities?.voice),
      sms: Boolean(n.capabilities?.sms),
      mms: Boolean(n.capabilities?.mms),
    };
    const id = byE164.get(e164);
    if (id) {
      await sb
        .from('phone_numbers')
        .update({ provider_sid: n.sid, capabilities: caps, label: n.friendlyName || null, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('organization_id', orgId);
      result.push({ e164, provider_sid: n.sid, label: n.friendlyName || null, capabilities: caps, created: false });
    } else {
      const { error } = await sb.from('phone_numbers').insert({
        organization_id: orgId,
        e164,
        provider: 'twilio',
        provider_sid: n.sid,
        capabilities: caps,
        label: n.friendlyName || null,
        is_primary: byE164.size === 0 && result.length === 0,
        is_active: true,
      });
      if (error) throw new Error(`No se pudo guardar ${e164}: ${error.message}`);
      result.push({ e164, provider_sid: n.sid, label: n.friendlyName || null, capabilities: caps, created: true });
    }
  }
  return result;
}

/** Apunta el número en Twilio a nuestros webhooks (idempotente). */
export async function syncNumberWebhooks(orgId: number, providerSid: string): Promise<void> {
  const origin = getTwilioWebhookOrigin();
  const { client: twilio } = await getTwilioClientForOrg(orgId);
  await twilio.incomingPhoneNumbers(providerSid).update({
    voiceUrl: `${origin}/api/voice/twiml/inbound`,
    voiceMethod: 'POST',
    statusCallback: `${origin}/api/voice/status`,
    statusCallbackMethod: 'POST',
  });
}

export interface InboundTargets {
  organizationId: number;
  userIds: string[];
  identities: string[];
  phoneNumberId: string | null;
}

/**
 * Resuelve la org y los destinatarios de una llamada entrante por `To`:
 * `phone_numbers.e164` (activo) → `comm_settings.phone_number`.
 * Destinatarios: `assigned_user_id` → miembros con `user_comm_preferences.default_call_mode='browser'`
 * → primer admin activo (role_id 1|2 o is_super_admin).
 */
export async function resolveInboundTargets(toE164: string, client?: SupabaseClient): Promise<InboundTargets | null> {
  const sb = client ?? getServiceClient();
  let orgId: number | null = null;
  let phoneNumberId: string | null = null;
  let assigned: string | null = null;

  const { data: pn } = await sb
    .from('phone_numbers')
    .select('id, organization_id, assigned_user_id, is_active')
    .eq('e164', toE164)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (pn) {
    const row = pn as { id: string; organization_id: number; assigned_user_id: string | null };
    orgId = row.organization_id;
    phoneNumberId = row.id;
    assigned = row.assigned_user_id;
  } else {
    const { data: cs } = await sb
      .from('comm_settings')
      .select('organization_id')
      .eq('phone_number', toE164)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    orgId = (cs as { organization_id?: number } | null)?.organization_id ?? null;
  }
  if (!orgId) return null;

  let userIds: string[] = [];
  if (assigned) userIds = [assigned];
  if (userIds.length === 0) {
    const { data: prefs } = await sb
      .from('user_comm_preferences')
      .select('user_id')
      .eq('organization_id', orgId)
      .eq('default_call_mode', 'browser')
      .limit(10);
    userIds = ((prefs ?? []) as { user_id: string }[]).map((p) => p.user_id);
  }
  if (userIds.length === 0) {
    const { data: admins } = await sb
      .from('organization_members')
      .select('user_id, role_id, is_super_admin')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .or('role_id.in.(1,2),is_super_admin.eq.true')
      .limit(3);
    userIds = ((admins ?? []) as { user_id: string }[]).map((a) => a.user_id);
  }
  // Solo miembros activos
  if (userIds.length > 0) {
    const { data: members } = await sb
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .in('user_id', userIds);
    const active = new Set(((members ?? []) as { user_id: string }[]).map((m) => m.user_id));
    userIds = userIds.filter((u) => active.has(u));
  }
  const identities = userIds.map((u) => buildVoiceIdentity(u, orgId as number));
  return { organizationId: orgId, userIds, identities, phoneNumberId };
}
