import { type SupabaseClient } from '@supabase/supabase-js';

export type ProviderCategory =
  | 'voice' | 'stt' | 'tts' | 'llm' | 'email'
  | 'whatsapp' | 'sms' | 'analysis' | 'esign' | 'calendar'
  | 'video' | 'enrichment';

export interface ProviderConfig {
  provider: string;
  credentials: Record<string, string>;
  settings: Record<string, unknown>;
  isActive: boolean;
  priority: number;
}

const ENV_FALLBACKS: Record<ProviderCategory, Record<string, string>> = {
  voice: { TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '', TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '' },
  stt: { DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY || '', ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || '' },
  tts: { ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || '' },
  llm: { OPENAI_API_KEY: process.env.OPENAI_API_KEY || '' },
  email: { RESEND_API_KEY: process.env.RESEND_API_KEY || '', SENDGRID_API_KEY: process.env.SENDGRID_API_KEY || '' },
  whatsapp: { TWILIO_WHATSAPP_NUMBER: process.env.TWILIO_WHATSAPP_NUMBER || '' },
  sms: { TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '' },
  analysis: { GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY || '' },
  esign: { DOCUMENSO_API_KEY: process.env.DOCUMENSO_API_KEY || '' },
  calendar: { CALCOM_API_KEY: process.env.CALCOM_API_KEY || '' },
  video: { DAILY_API_KEY: process.env.DAILY_API_KEY || '' },
  enrichment: { APOLLO_API_KEY: process.env.APOLLO_API_KEY || '' },
};

// Mapeo explícito de provider por defecto para cada categoría.
// Antes se derivaba del nombre de la primera env var con valor, lo cual
// producía resultados incorrectos (ej: stt → 'deepgram' o 'elevenlabs'
// dependiendo del orden de las keys). Ahora cada categoría tiene su
// provider por defecto determinado explícitamente.
const DEFAULT_PROVIDER: Record<ProviderCategory, string> = {
  voice: 'twilio',
  stt: 'deepgram',
  tts: 'elevenlabs',
  llm: 'openai',
  email: 'resend',
  whatsapp: 'twilio',
  sms: 'twilio',
  analysis: 'google',
  esign: 'documenso',
  calendar: 'calcom',
  video: 'daily',
  enrichment: 'apollo',
};

export async function getActiveProvider(
  organizationId: number,
  category: ProviderCategory,
  supabaseClient?: SupabaseClient<any, any, any>
): Promise<ProviderConfig> {
  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from('provider_configs')
      .select('provider, credentials, settings, is_active, priority')
      .eq('organization_id', organizationId)
      .eq('category', category)
      .eq('is_active', true)
      .order('priority', { ascending: true })
      .limit(1)
      .single();

    if (!error && data) {
      return {
        provider: data.provider,
        credentials: data.credentials as Record<string, string>,
        settings: data.settings as Record<string, unknown>,
        isActive: data.is_active,
        priority: data.priority,
      };
    }
  }

  // Fallback a env vars globales — provider determinado por mapeo explícito
  const envCreds = ENV_FALLBACKS[category] || {};
  const hasCreds = Object.values(envCreds).some(v => v);
  return {
    provider: hasCreds ? DEFAULT_PROVIDER[category] : 'none',
    credentials: envCreds,
    settings: {},
    isActive: hasCreds,
    priority: 999,
  };
}

export async function listProviders(
  organizationId: number,
  category: ProviderCategory,
  supabaseClient: SupabaseClient<any, any, any>
): Promise<ProviderConfig[]> {
  const { data, error } = await supabaseClient
    .from('provider_configs')
    .select('provider, credentials, settings, is_active, priority')
    .eq('organization_id', organizationId)
    .eq('category', category)
    .order('priority', { ascending: true });

  if (error || !data) return [];

  return data.map((d: any) => ({
    provider: d.provider,
    credentials: d.credentials as Record<string, string>,
    settings: d.settings as Record<string, unknown>,
    isActive: d.is_active,
    priority: d.priority,
  }));
}
