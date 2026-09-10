/**
 * telephonySettingsService — tab Telefonía (FASE-03 §4.2). SOLO servidor.
 *
 * Lee/escribe `comm_settings.voice_*` con el service client (RLS de
 * comm_settings solo permite UPDATE por columnas a admins; el endpoint
 * verifica el rol antes). Valida con zod; el mensaje de consentimiento es
 * obligatorio (≥ 20 caracteres) cuando la grabación está activa (D9).
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getTelephonySettings, type TelephonySettings } from './voiceContextService';

export const CONSENT_VOICES = ['Polly.Mia-Neural', 'Polly.Andres-Neural', 'Polly.Lupe-Neural', 'Polly.Pedro-Neural'] as const;
export const CONSENT_LANGUAGES = ['es-MX', 'es-US', 'es-ES'] as const;

const e164 = z.string().regex(/^\+[1-9]\d{6,14}$/, 'Número en formato E.164 (+57…)');

export const telephonyPatchSchema = z
  .object({
    voice_recording_enabled: z.boolean().optional(),
    voice_consent_message: z.string().trim().max(500).optional(),
    voice_recording_retention_days: z.number().int().min(7).max(730).optional(),
    voice_ring_timeout_seconds: z.number().int().min(10).max(60).optional(),
    voice_max_concurrent_calls: z.number().int().min(1).max(50).optional(),
    voice_caller_id: e164.nullable().optional(),
    phone_number: e164.nullable().optional(),
  })
  .strict();
export type TelephonyPatch = z.infer<typeof telephonyPatchSchema>;

export class TelephonyValidationError extends Error {
  statusCode = 400;
}

export interface TelephonySettingsView extends TelephonySettings {
  /** Preferencias de voz/consentimiento que viven en provider_configs (voice).settings o defaults. */
  consent_voice: string;
  consent_language: string;
}

export async function getTelephonySettingsView(orgId: number, client?: SupabaseClient): Promise<TelephonySettingsView> {
  const sb = client ?? getServiceClient();
  const settings = await getTelephonySettings(orgId, sb);
  const { data } = await sb
    .from('provider_configs')
    .select('settings')
    .eq('organization_id', orgId)
    .eq('category', 'voice')
    .limit(1)
    .maybeSingle();
  const s = ((data as { settings?: Record<string, unknown> } | null)?.settings ?? {}) as Record<string, unknown>;
  return {
    ...settings,
    consent_voice: typeof s.consent_voice === 'string' && s.consent_voice ? s.consent_voice : 'Polly.Mia-Neural',
    consent_language: typeof s.consent_language === 'string' && s.consent_language ? s.consent_language : 'es-MX',
  };
}

/**
 * Actualiza `comm_settings.voice_*` (crea la fila si la org no la tiene).
 * Lanza TelephonyValidationError si grabación ON con consentimiento < 20 chars.
 */
export async function updateTelephonySettings(orgId: number, patch: TelephonyPatch, client?: SupabaseClient): Promise<TelephonySettingsView> {
  const sb = client ?? getServiceClient();
  const current = await getTelephonySettings(orgId, sb);
  const recording = patch.voice_recording_enabled ?? current.voice_recording_enabled;
  const consent = (patch.voice_consent_message ?? current.voice_consent_message ?? '').trim();
  if (recording && consent.length < 20) {
    throw new TelephonyValidationError('Con la grabación activa el mensaje de consentimiento debe tener al menos 20 caracteres');
  }

  const row: Record<string, unknown> = { ...patch };
  if (patch.voice_consent_message !== undefined) row.voice_consent_message = consent;
  const { data: existing } = await sb.from('comm_settings').select('id').eq('organization_id', orgId).limit(1).maybeSingle();
  if (existing) {
    const { error } = await sb.from('comm_settings').update(row).eq('organization_id', orgId);
    if (error) throw new Error(`comm_settings update: ${error.message}`);
  } else {
    const { error } = await sb.from('comm_settings').insert({ organization_id: orgId, is_active: true, ...row });
    if (error) throw new Error(`comm_settings insert: ${error.message}`);
  }
  return getTelephonySettingsView(orgId, sb);
}
