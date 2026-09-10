/**
 * GO Assistant — enrutado de modelos.
 *
 * Regla (§5.6): **ningún modelo cableado en el código**. Cada tarea resuelve su
 * modelo por: `ai_settings` de la organización → variable de entorno → un
 * default declarado aquí y en un solo sitio.
 *
 * El default cableado que había (`gpt-4o-mini` dentro de `aiAssistantService`)
 * era de otra época y ganaba siempre, aunque la organización tuviera otro
 * configurado.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type AgentTask =
  /** Razonamiento y llamada a herramientas: el camino principal. */
  | 'reasoning'
  /** Conversación larga y voz. */
  | 'conversation'
  /** Clasificación barata: intención, títulos de conversación. */
  | 'cheap'
  /** Visión: facturas y documentos (F4). */
  | 'vision'
  /** Transcripción (F5). */
  | 'stt';

interface TaskConfig {
  env: string;
  fallback: string;
  provider: 'openai' | 'google' | 'elevenlabs';
}

/**
 * Los `fallback` son el último recurso, no la intención. Lo que se espera en
 * producción es que `.env` traiga los modelos de 2026 (ver `.env.example`).
 */
const TASKS: Record<AgentTask, TaskConfig> = {
  reasoning: { env: 'OPENAI_MODEL', fallback: 'gpt-4o-mini', provider: 'openai' },
  conversation: { env: 'OPENAI_CONVERSATION_MODEL', fallback: 'gpt-4o-mini', provider: 'openai' },
  cheap: { env: 'OPENAI_CHEAP_MODEL', fallback: 'gpt-4o-mini', provider: 'openai' },
  vision: { env: 'GEMINI_ANALYSIS_MODEL', fallback: 'gemini-1.5-flash', provider: 'google' },
  stt: { env: 'OPENAI_TRANSCRIBE_MODEL', fallback: 'whisper-1', provider: 'openai' },
};

export interface ResolvedModel {
  model: string;
  provider: 'openai' | 'google' | 'elevenlabs';
  temperature: number;
  maxTokens: number;
  /** De dónde salió, para poder depurar por qué respondió quien respondió. */
  source: 'organization' | 'environment' | 'default';
}

export interface OrgModelSettings {
  model: string | null;
  temperature: number | null;
  maxTokens: number | null;
  systemRules: string | null;
  tone: string | null;
  language: string | null;
  /** `ai_assistant_settings.model_overrides`, por tarea. */
  overrides: Record<string, string>;
}

const EMPTY_SETTINGS: OrgModelSettings = {
  model: null,
  temperature: null,
  maxTokens: null,
  systemRules: null,
  tone: null,
  language: null,
  overrides: {},
};

/**
 * Lee la configuración de IA de la organización.
 *
 * Fail-safe: si algo falla se devuelve vacío y manda el entorno. Que no se pueda
 * leer una preferencia no puede dejar mudo al asistente.
 */
export async function loadOrgModelSettings(
  supabase: SupabaseClient,
  organizationId: number
): Promise<OrgModelSettings> {
  try {
    const [settingsRes, assistantRes] = await Promise.all([
      supabase
        .from('ai_settings')
        .select('model, temperature, max_tokens, system_rules, tone, language')
        .eq('organization_id', organizationId)
        .maybeSingle(),
      supabase
        .from('ai_assistant_settings')
        .select('model_overrides')
        .eq('organization_id', organizationId)
        .maybeSingle(),
    ]);

    const s = settingsRes.data as {
      model: string | null;
      temperature: number | null;
      max_tokens: number | null;
      system_rules: string | null;
      tone: string | null;
      language: string | null;
    } | null;

    const overridesRaw = (assistantRes.data as { model_overrides: unknown } | null)?.model_overrides;
    const overrides: Record<string, string> = {};
    if (overridesRaw && typeof overridesRaw === 'object') {
      for (const [k, v] of Object.entries(overridesRaw as Record<string, unknown>)) {
        if (typeof v === 'string' && v.trim()) overrides[k] = v.trim();
      }
    }

    return {
      model: s?.model ?? null,
      temperature: s?.temperature ?? null,
      maxTokens: s?.max_tokens ?? null,
      systemRules: s?.system_rules ?? null,
      tone: s?.tone ?? null,
      language: s?.language ?? null,
      overrides,
    };
  } catch (error) {
    console.warn(
      '[GO Assistant] No se pudo leer la configuración de IA; se usa el entorno:',
      error instanceof Error ? error.message : error
    );
    return EMPTY_SETTINGS;
  }
}

/**
 * `ai_settings.max_tokens` tiene default 500, pensado para respuestas de
 * WhatsApp. El asistente interno explica procesos y llama a herramientas: con
 * 500 corta a media frase. Se respeta la configuración solo cuando es mayor que
 * el mínimo utilizable.
 */
const MIN_USABLE_TOKENS = 1500;

export function resolveModel(
  task: AgentTask,
  settings: OrgModelSettings = EMPTY_SETTINGS
): ResolvedModel {
  const config = TASKS[task];

  const fromOverride = settings.overrides[task];
  const fromOrg = task === 'reasoning' || task === 'conversation' ? settings.model : null;
  const fromEnv = process.env[config.env];

  let model: string;
  let source: ResolvedModel['source'];

  if (fromOverride) {
    model = fromOverride;
    source = 'organization';
  } else if (fromOrg) {
    model = fromOrg;
    source = 'organization';
  } else if (fromEnv) {
    model = fromEnv;
    source = 'environment';
  } else {
    model = config.fallback;
    source = 'default';
  }

  return {
    model,
    provider: config.provider,
    temperature: settings.temperature ?? 0.7,
    maxTokens: Math.max(settings.maxTokens ?? 0, MIN_USABLE_TOKENS),
    source,
  };
}
