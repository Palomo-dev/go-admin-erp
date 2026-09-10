/**
 * Voice Context Service — contexto único de telefonía por organización.
 * GO Admin ERP — FASE-03 §4.2 (SOLO servidor).
 *
 * - `getVoiceCredentials(orgId)`: credenciales efectivas de Twilio para voz:
 *   registry (`getProviderCredentials(org,'voice')`, REG) + `comm_settings`
 *   (subcuenta `twilio_subaccount_sid/auth_token`, `voice_twiml_app_sid`).
 * - `getTelephonySettings(orgId, client)`: `comm_settings.voice_*` con el
 *   service client (cierra C15: antes se leía con el cliente anon → null).
 * - `pickCallerId(orgId, settings, client)`: `voice_caller_id` →
 *   `phone_numbers.is_primary` → `comm_settings.phone_number` → env.
 * - `getTwilioClientForOrg(orgId)`: cliente REST de la (sub)cuenta.
 */

import Twilio from 'twilio';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getProviderCredentials } from '@/lib/services/providerCredentials.server';

export class VoiceNotConfiguredError extends Error {
  code = 'VOICE_NOT_CONFIGURED' as const;
  statusCode = 409;
  /**
   * Nombres de las credenciales que faltan (NUNCA valores). Permite que el
   * softphone diga qué falta en vez de un genérico "no configurada".
   */
  missing: string[];
  constructor(message = 'Telefonía no configurada para esta organización', missing: string[] = []) {
    super(message);
    this.name = 'VoiceNotConfiguredError';
    this.missing = missing;
  }
}

export interface VoiceCredentials {
  accountSid: string;
  /** Auth token de la (sub)cuenta (para REST y Basic Auth de respaldo). */
  authToken: string;
  apiKey: string;
  apiSecret: string;
  twimlAppSid: string;
  /** Número por defecto de la plataforma/org (env `TWILIO_PHONE_NUMBER` o registry). */
  defaultNumber: string;
  isSubaccount: boolean;
  source: 'org' | 'env' | 'none';
}

export interface TelephonySettings {
  organization_id: number;
  phone_number: string | null;
  voice_caller_id: string | null;
  voice_recording_enabled: boolean;
  voice_recording_retention_days: number;
  voice_consent_message: string;
  voice_ring_timeout_seconds: number;
  voice_max_concurrent_calls: number;
  voice_minutes_remaining: number | null;
  voice_twiml_app_sid: string | null;
  twilio_subaccount_sid: string | null;
  voice_agent_enabled: boolean;
}

export const DEFAULT_CONSENT_MESSAGE =
  'Esta llamada será grabada con fines de calidad y servicio. Si no está de acuerdo, por favor cuelgue.';

const DEFAULT_SETTINGS: Omit<TelephonySettings, 'organization_id'> = {
  phone_number: null,
  voice_caller_id: null,
  voice_recording_enabled: false,
  voice_recording_retention_days: 90,
  voice_consent_message: DEFAULT_CONSENT_MESSAGE,
  voice_ring_timeout_seconds: 30,
  voice_max_concurrent_calls: 5,
  voice_minutes_remaining: null,
  voice_twiml_app_sid: null,
  twilio_subaccount_sid: null,
  voice_agent_enabled: false,
};

export const TELEPHONY_SETTINGS_COLUMNS =
  'organization_id, phone_number, voice_caller_id, voice_recording_enabled, voice_recording_retention_days, voice_consent_message, voice_ring_timeout_seconds, voice_max_concurrent_calls, voice_minutes_remaining, voice_twiml_app_sid, twilio_subaccount_sid, voice_agent_enabled';

/** Ajustes de telefonía de la org (defaults seguros si no hay fila). */
export async function getTelephonySettings(orgId: number, client?: SupabaseClient): Promise<TelephonySettings> {
  const sb = client ?? getServiceClient();
  const { data } = await sb
    .from('comm_settings')
    .select(TELEPHONY_SETTINGS_COLUMNS)
    .eq('organization_id', orgId)
    .limit(1)
    .maybeSingle();
  const row = (data ?? {}) as Partial<TelephonySettings>;
  const merged: TelephonySettings = { ...DEFAULT_SETTINGS, ...stripNulls(row), organization_id: orgId };
  if (!merged.voice_consent_message || !merged.voice_consent_message.trim()) {
    merged.voice_consent_message = DEFAULT_CONSENT_MESSAGE;
  }
  return merged;
}

function stripNulls<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** Credenciales de voz efectivas (registry + comm_settings). Nunca lanza por falta de claves. */
export async function getVoiceCredentials(orgId: number): Promise<VoiceCredentials> {
  const [cfg, settings] = await Promise.all([
    getProviderCredentials(orgId, 'voice', 'twilio'),
    getServiceClient()
      .from('comm_settings')
      .select('twilio_subaccount_sid, twilio_subaccount_auth_token, voice_twiml_app_sid')
      .eq('organization_id', orgId)
      .limit(1)
      .maybeSingle()
      .then((r) => (r.data ?? null) as { twilio_subaccount_sid?: string | null; twilio_subaccount_auth_token?: string | null; voice_twiml_app_sid?: string | null } | null),
  ]);

  const c = cfg.credentials ?? {};
  const isSubaccount = Boolean(settings?.twilio_subaccount_sid && settings?.twilio_subaccount_auth_token);
  return {
    accountSid: (isSubaccount ? settings!.twilio_subaccount_sid! : c.TWILIO_ACCOUNT_SID) || '',
    authToken: (isSubaccount ? settings!.twilio_subaccount_auth_token! : c.TWILIO_AUTH_TOKEN) || '',
    apiKey: c.TWILIO_API_KEY || '',
    apiSecret: c.TWILIO_API_SECRET || '',
    twimlAppSid: settings?.voice_twiml_app_sid || c.TWILIO_TWIML_APP_SID || '',
    defaultNumber: c.TWILIO_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER || '',
    isSubaccount,
    source: cfg.source ?? 'none',
  };
}

/** `Authorization: Basic …` para descargar grabaciones (API Key preferida, C12). */
export function basicAuthHeader(creds: Pick<VoiceCredentials, 'apiKey' | 'apiSecret' | 'accountSid' | 'authToken'>): string | null {
  if (creds.apiKey && creds.apiSecret) return `Basic ${Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString('base64')}`;
  if (creds.accountSid && creds.authToken) return `Basic ${Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64')}`;
  return null;
}

/** Cliente REST de Twilio para la (sub)cuenta de la org. Lanza VoiceNotConfiguredError si no hay credenciales. */
export async function getTwilioClientForOrg(orgId: number): Promise<{ client: Twilio.Twilio; creds: VoiceCredentials }> {
  const creds = await getVoiceCredentials(orgId);
  if (creds.apiKey && creds.apiSecret && creds.accountSid) {
    return { client: Twilio(creds.apiKey, creds.apiSecret, { accountSid: creds.accountSid }), creds };
  }
  if (creds.accountSid && creds.authToken) {
    return { client: Twilio(creds.accountSid, creds.authToken), creds };
  }
  throw new VoiceNotConfiguredError('Sin credenciales REST de Twilio para la organización');
}

/** De dónde salió el caller id (`platform` = número global de la env, NO de la org). */
export type CallerIdSource = 'settings_caller_id' | 'phone_numbers' | 'settings_phone' | 'platform' | 'none';

export interface PickedCallerId {
  e164: string | null;
  phoneNumberId: string | null;
  source: CallerIdSource;
}

/**
 * Caller id saliente: `voice_caller_id` → número primario activo de
 * `phone_numbers` → `comm_settings.phone_number` → `TWILIO_PHONE_NUMBER`.
 *
 * Ronda 2 (defecto M2): el último escalón es de la PLATAFORMA, no de la
 * organización — se devuelve marcado como `source: 'platform'` para que el
 * llamador decida. `twiml/outbound` lo rechaza salvo que
 * `allowPlatformFallback` sea true (hoy solo en desarrollo explícito).
 */
export async function pickCallerId(
  orgId: number,
  settings: TelephonySettings,
  client?: SupabaseClient,
  defaultNumber?: string
): Promise<PickedCallerId> {
  if (settings.voice_caller_id) return { e164: settings.voice_caller_id, phoneNumberId: null, source: 'settings_caller_id' };
  const sb = client ?? getServiceClient();
  const { data } = await sb
    .from('phone_numbers')
    .select('id, e164, is_primary')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { id: string; e164: string } | null;
  if (row?.e164) return { e164: row.e164, phoneNumberId: row.id, source: 'phone_numbers' };
  if (settings.phone_number) return { e164: settings.phone_number, phoneNumberId: null, source: 'settings_phone' };
  const env = defaultNumber || process.env.TWILIO_PHONE_NUMBER || null;
  return { e164: env, phoneNumberId: null, source: env ? 'platform' : 'none' };
}

/**
 * ¿Ese número E.164 es de la organización?
 *
 * Ronda 3 (gemelo de M2, defecto N-1): `/api/voice/call` aceptaba el `from` del
 * cuerpo de la petición, así que un miembro autenticado podía marcar mostrando
 * el número de otra organización (suplantación). Un número es "de la org" si es
 * su `voice_caller_id`, su `comm_settings.phone_number`, o un `phone_numbers`
 * activo suyo. El número global de la plataforma NO cuenta.
 */
export async function orgOwnsCallerId(
  orgId: number,
  e164: string,
  settings: TelephonySettings,
  client?: SupabaseClient
): Promise<boolean> {
  const wanted = String(e164 || '').trim();
  if (!wanted) return false;
  if (settings.voice_caller_id === wanted || settings.phone_number === wanted) return true;
  const sb = client ?? getServiceClient();
  const { data } = await sb
    .from('phone_numbers')
    .select('id')
    .eq('organization_id', orgId)
    .eq('e164', wanted)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

/**
 * ¿El `AccountSid` que firmó el webhook corresponde a esta organización?
 *
 * Ronda 2 (defecto M1): `verifyTwilioWebhook` acepta el token de CUALQUIER
 * cuenta resoluble (master o subcuenta de otra org). Antes de mutar una fila
 * `calls` localizada por `callId`/`CallSid` hay que comprobar que quien firma
 * es la cuenta de esa organización:
 * - org con subcuenta propia → solo su subcuenta (o la master, que es su dueña)
 * - org sin subcuenta → solo la cuenta master/legacy de la plataforma
 *
 * Fail-closed: sin `AccountSid` o sin master configurada devuelve false.
 */
/**
 * ¿El AccountSid firmante pertenece a esta organización?
 *
 * ADVERTENCIA SOBRE SU ALCANCE REAL (F5 ronda 2, B-2) — leer antes de confiar
 * en esta función como aislamiento entre organizaciones:
 *
 * Solo discrimina cuando la organización TIENE subcuenta. Si no la tiene, cae
 * al SID master de la plataforma, que es el mismo para todas: entonces devuelve
 * `true` para CUALQUIER organización. Y hoy **ninguna la tiene**: 0 de 83
 * organizaciones con `comm_settings.twilio_subaccount_sid` (verificado por MCP
 * contra `jgmgphmzusbluqhuqihj`, 2026-09-10).
 *
 * Consecuencia práctica, escrita para que nadie la dé por supuesta: mientras no
 * se aprovisionen subcuentas, **la única barrera efectiva entre organizaciones
 * en los callbacks del bridge es el token HMAC** de `bridgeTokens.ts`
 * (`verifyBridgeToken`), que sí liga cada URL a su bridge concreto. Un atacante
 * que firme con el SID master y acierte el bridgeId sigue necesitando ese
 * token. Por eso ninguna ruta del bridge puede quedarse solo con esta
 * comprobación, y por eso `VOICE_CALLBACK_SECRET` es obligatorio para marcar
 * (`isBridgeSigningConfigured`, 503 en `initiateBridge`).
 *
 * Esta función sigue siendo necesaria —cierra el caso de la subcuenta ajena en
 * cuanto exista aprovisionamiento— pero NO es suficiente por sí sola hoy.
 */
export async function accountSidMatchesOrg(orgId: number, accountSid: string, client?: SupabaseClient): Promise<boolean> {
  if (!accountSid) return false;
  const sb = client ?? getServiceClient();
  const { data } = await sb
    .from('comm_settings')
    .select('twilio_subaccount_sid')
    .eq('organization_id', orgId)
    .limit(1)
    .maybeSingle();
  const sub = (data as { twilio_subaccount_sid?: string | null } | null)?.twilio_subaccount_sid || null;
  if (sub && accountSid === sub) return true;
  const master = process.env.TWILIO_MASTER_ACCOUNT_SID || '';
  const legacy = process.env.TWILIO_ACCOUNT_SID || '';
  return Boolean((master && accountSid === master) || (legacy && accountSid === legacy));
}

/**
 * Valida que `customerId`/`opportunityId` pertenecen a la organización.
 *
 * Ronda 2 (defecto A2): estos ids llegan desde el navegador
 * (`device.connect({params})`), así que comprobar el formato UUID no basta —
 * un miembro de una org podía enlazar su llamada (y la `activities` derivada)
 * a registros de otra. Los ids ajenos o inexistentes se descartan a `null` y se
 * devuelven en `rejected` para dejarlos en `calls.metadata`.
 */
export async function filterOrgOwnedRefs(
  orgId: number,
  refs: { customerId?: string | null; opportunityId?: string | null },
  client?: SupabaseClient
): Promise<{ customerId: string | null; opportunityId: string | null; rejected: string[] }> {
  const sb = client ?? getServiceClient();
  const rejected: string[] = [];

  const belongs = async (table: 'customers' | 'opportunities', id: string): Promise<boolean> => {
    const { data, error } = await sb.from(table).select('id').eq('id', id).eq('organization_id', orgId).limit(1).maybeSingle();
    if (error) {
      console.warn(`[voiceContext] filterOrgOwnedRefs ${table}:`, error.message);
      return false; // fail-closed
    }
    return Boolean(data);
  };

  let customerId: string | null = refs.customerId || null;
  let opportunityId: string | null = refs.opportunityId || null;
  if (customerId && !(await belongs('customers', customerId))) {
    rejected.push(`customer:${customerId}`);
    customerId = null;
  }
  if (opportunityId && !(await belongs('opportunities', opportunityId))) {
    rejected.push(`opportunity:${opportunityId}`);
    opportunityId = null;
  }
  return { customerId, opportunityId, rejected };
}

/** Comprueba que el usuario es miembro activo de la org (identity del TwiML App). */
export async function isActiveMember(orgId: number, userId: string, client?: SupabaseClient): Promise<boolean> {
  const sb = client ?? getServiceClient();
  const { data } = await sb
    .from('organization_members')
    .select('id')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}
