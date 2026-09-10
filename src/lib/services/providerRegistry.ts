/**
 * Registry de proveedores (F0 §4.2).
 *
 * - `resolveEnvFallback(category)`: credenciales/settings globales desde env,
 *   ignorando placeholders de `.env.example` (tester-F00 r1).
 * - `getActiveProvider(orgId, category)`: alias deprecado que delega en
 *   `getProviderCredentials` (server-only, service role). Ya NO lee la columna
 *   `credentials` con el cliente de sesión (C8 msg): el parámetro
 *   `supabaseClient` se ignora y se mantiene solo por compatibilidad.
 * - `listProvidersSafe(orgId)`: lista sin credenciales (para UI/endpoints).
 *
 * Este módulo no importa cliente browser ni service client de forma estática
 * (el server-only vive en `providerCredentials.server.ts`).
 */

import {
  type ProviderCategory,
  isPlaceholderCredential,
  pickConfiguredKeys,
} from '@/lib/crm/providerCatalog';

export type { ProviderCategory } from '@/lib/crm/providerCatalog';

export interface ProviderConfig {
  provider: string;
  credentials: Record<string, string>;
  settings: Record<string, unknown>;
  isActive: boolean;
  priority: number;
  /** 'org' = fila propia en provider_configs; 'env' = fallback global; 'none' = nada. */
  source?: 'org' | 'env' | 'none';
}

/** Shape seguro para UI: nunca incluye valores de credenciales. */
export interface ProviderConfigSafe {
  id?: string;
  category: ProviderCategory;
  provider: string;
  settings: Record<string, unknown>;
  is_active: boolean;
  priority: number;
  /** La org tiene credenciales propias válidas (no placeholder). */
  configured: boolean;
  /** Existe fallback global (env) válido para este proveedor. */
  platform_available: boolean;
  /** Claves de credenciales presentes (sin valores). */
  credential_keys: string[];
  updated_at?: string | null;
}

const env = (k: string): string => process.env[k] || '';

/**
 * Fallback env por categoría (evaluado en cada llamada para que los tests y
 * el runtime lean el estado actual de process.env).
 */
export function buildEnvFallbacks(): Record<ProviderCategory, Record<string, Record<string, string>>> {
  const twilio = {
    TWILIO_ACCOUNT_SID: env('TWILIO_ACCOUNT_SID') || env('TWILIO_MASTER_ACCOUNT_SID'),
    TWILIO_AUTH_TOKEN: env('TWILIO_AUTH_TOKEN') || env('TWILIO_MASTER_AUTH_TOKEN'),
    TWILIO_API_KEY: env('TWILIO_API_KEY'),
    TWILIO_API_SECRET: env('TWILIO_API_SECRET'),
    TWILIO_TWIML_APP_SID: env('TWILIO_TWIML_APP_SID'),
    TWILIO_PHONE_NUMBER: env('TWILIO_PHONE_NUMBER'),
  };
  return {
    voice: { twilio },
    stt: {
      elevenlabs: { ELEVENLABS_API_KEY: env('ELEVENLABS_API_KEY') },
      google: { GOOGLE_AI_API_KEY: env('GOOGLE_AI_API_KEY') || env('GEMINI_API_KEY') },
      openai: { OPENAI_API_KEY: env('OPENAI_API_KEY') },
      deepgram: { DEEPGRAM_API_KEY: env('DEEPGRAM_API_KEY') },
    },
    tts: { elevenlabs: { ELEVENLABS_API_KEY: env('ELEVENLABS_API_KEY') } },
    llm: {
      openai: { OPENAI_API_KEY: env('OPENAI_API_KEY') },
      google: { GOOGLE_AI_API_KEY: env('GOOGLE_AI_API_KEY') || env('GEMINI_API_KEY') },
    },
    analysis: {
      google: { GOOGLE_AI_API_KEY: env('GOOGLE_AI_API_KEY') || env('GEMINI_API_KEY') },
      openai: { OPENAI_API_KEY: env('OPENAI_API_KEY') },
    },
    email: { resend: { RESEND_API_KEY: env('RESEND_API_KEY') } },
    whatsapp: {
      meta: {
        META_ACCESS_TOKEN: env('WHATSAPP_ACCESS_TOKEN') || env('META_ACCESS_TOKEN'),
        META_PHONE_NUMBER_ID: env('WHATSAPP_PHONE_NUMBER_ID') || env('META_PHONE_NUMBER_ID'),
        META_APP_SECRET: env('META_APP_SECRET') || env('WHATSAPP_APP_SECRET'),
      },
      twilio: { ...twilio, TWILIO_WHATSAPP_NUMBER: env('TWILIO_WHATSAPP_NUMBER') },
    },
    sms: { twilio: { ...twilio, TWILIO_MESSAGING_SERVICE_SID: env('TWILIO_MESSAGING_SERVICE_SID') } },
    esign: { documenso: { DOCUMENSO_API_KEY: env('DOCUMENSO_API_KEY') } },
    calendar: { calcom: { CALCOM_API_KEY: env('CALCOM_API_KEY') }, internal: {} },
    video: { daily: { DAILY_API_KEY: env('DAILY_API_KEY') } },
    enrichment: { apollo: { APOLLO_API_KEY: env('APOLLO_API_KEY') } },
  };
}

/** Settings por defecto cuando la org no tiene fila (modelos desde env con defaults V4). */
export function defaultSettings(category: ProviderCategory, provider: string): Record<string, unknown> {
  switch (`${category}:${provider}`) {
    case 'stt:elevenlabs':
      return { model_id: env('ELEVENLABS_SCRIBE_MODEL') || 'scribe_v2', language_code: 'spa', diarize: true };
    // gemini-2.5-flash devuelve 404 "no longer available to new users" con claves
    // nuevas (verificado en vivo por F4, 2026-09-08). El default pasa a
    // gemini-3.8-flash, que además es el único Flash con SKU en provider_pricing.
    case 'stt:google':
    case 'analysis:google':
      return { model: env('GEMINI_ANALYSIS_MODEL') || 'gemini-3.8-flash' };
    case 'tts:elevenlabs':
      return { model_id: env('ELEVENLABS_MODEL') || 'eleven_flash_v2_5' };
    case 'llm:openai':
      return {
        model: env('OPENAI_MODEL') || 'gpt-5.6-luna',
        cheap_model: env('OPENAI_CHEAP_MODEL') || env('OPENAI_MODEL') || 'gpt-5.6-luna',
        conversation_model: env('OPENAI_CONVERSATION_MODEL') || 'gpt-5.6-terra',
      };
    case 'llm:google':
      return { model: env('GEMINI_CHAT_MODEL') || 'gemini-3.8-flash' };
    case 'analysis:openai':
      return { model: env('OPENAI_MODEL') || 'gpt-5.6-luna' };
    case 'voice:twilio':
      return { use_master_account: true, recording_channels: 'dual', consent_language: 'es-MX', consent_voice: 'Polly.Mia-Neural' };
    case 'sms:twilio':
      return { advanced_opt_out: true };
    case 'email:resend':
      return { tracking_marketing_only: true };
    default:
      return {};
  }
}

/** Proveedor por defecto por categoría (alineado con el seed M9 y D1). */
export const DEFAULT_PROVIDER: Record<ProviderCategory, string> = {
  voice: 'twilio',
  stt: 'elevenlabs',
  tts: 'elevenlabs',
  llm: 'openai',
  email: 'resend',
  whatsapp: 'meta',
  sms: 'twilio',
  analysis: 'google',
  esign: 'documenso',
  calendar: 'internal',
  video: 'daily',
  enrichment: 'apollo',
};

/** Solo las credenciales reales (sin placeholders/vacíos). */
export function sanitizeCredentials(creds: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of pickConfiguredKeys(creds)) out[k] = String((creds as Record<string, unknown>)[k]);
  return out;
}

/**
 * Resuelve el fallback env para una categoría (y opcionalmente un proveedor
 * concreto). Devuelve `isActive=false`/`provider='none'` si no hay ninguna
 * credencial real.
 */
export function resolveEnvFallback(category: ProviderCategory, provider?: string): ProviderConfig {
  const byProvider = buildEnvFallbacks()[category] || {};
  const candidates = provider ? [provider] : [DEFAULT_PROVIDER[category], ...Object.keys(byProvider)];
  for (const p of candidates) {
    const creds = sanitizeCredentials(byProvider[p]);
    if (Object.keys(creds).length > 0) {
      return { provider: p, credentials: creds, settings: defaultSettings(category, p), isActive: true, priority: 999, source: 'env' };
    }
  }
  return {
    provider: provider ?? 'none',
    credentials: {},
    settings: provider ? defaultSettings(category, provider) : {},
    isActive: false,
    priority: 999,
    source: 'none',
  };
}

/** ¿Hay fallback global válido para (categoría, proveedor)? */
export function hasPlatformCredentials(category: ProviderCategory, provider: string): boolean {
  const creds = buildEnvFallbacks()[category]?.[provider];
  return !!creds && Object.values(creds).some((v) => !isPlaceholderCredential(v));
}

/**
 * @deprecated Usar `getProviderCredentials` de `providerCredentials.server.ts`.
 * Se mantiene para los consumidores existentes (voice/call, voiceTokenService,
 * callAnalysisService, transcriptionService, emailService, mobileBridgeService,
 * voiceAgentService). El tercer parámetro se ignora: las credenciales solo se
 * leen con service role en el servidor.
 */
export async function getActiveProvider(
  organizationId: number,
  category: ProviderCategory,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _supabaseClient?: unknown,
): Promise<ProviderConfig> {
  const mod = await import('./providerCredentials.server');
  return mod.getProviderCredentials(organizationId, category);
}

/**
 * Lista las filas de `provider_configs` de una org SIN credenciales.
 * Usa el cliente que se le pase (sesión o service); si la vista
 * `v_provider_configs_safe` existe (DB F0) se prefiere; si no, selecciona
 * columnas no sensibles de la tabla.
 */
// Subconjunto mínimo del query builder de supabase-js (permite inyectar fakes en tests).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MinimalQueryClient = { from: (table: string) => any };

interface SafeRow {
  id: string;
  category: ProviderCategory;
  provider: string;
  settings: Record<string, unknown> | null;
  is_active: boolean | null;
  priority: number | null;
  updated_at?: string | null;
}

export async function listProvidersSafe(
  organizationId: number,
  supabaseClient: MinimalQueryClient,
  category?: ProviderCategory,
): Promise<ProviderConfigSafe[]> {
  const cols = 'id, category, provider, settings, is_active, priority, updated_at';
  let q = supabaseClient.from('v_provider_configs_safe').select(cols).eq('organization_id', organizationId);
  if (category) q = q.eq('category', category);
  let { data, error } = await q.order('category').order('priority', { ascending: true });
  if (error) {
    let q2 = supabaseClient.from('provider_configs').select(cols).eq('organization_id', organizationId);
    if (category) q2 = q2.eq('category', category);
    ({ data, error } = await q2.order('category').order('priority', { ascending: true }));
  }
  if (error || !data) return [];
  return (data as SafeRow[]).map((d) => ({
    id: d.id,
    category: d.category,
    provider: d.provider,
    settings: (d.settings ?? {}) as Record<string, unknown>,
    is_active: !!d.is_active,
    priority: d.priority ?? 999,
    configured: false,
    platform_available: hasPlatformCredentials(d.category, d.provider),
    credential_keys: [],
    updated_at: d.updated_at ?? null,
  }));
}
