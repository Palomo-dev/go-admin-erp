import { z } from 'zod';
import { VOICE_AGENT_ENGINES, VOICE_AGENT_PURPOSES } from '@/lib/crm/enums';
import { ALL_TOOL_NAMES, MANDATORY_TOOLS } from './voiceAgentToolCatalog';
import { CrmHttpError } from './crmErrors';
import type { CrmSesion } from './crmRouteSupport';

const json = z.record(z.unknown()).refine(value => JSON.stringify(value).length <= 16000, 'Configuración demasiado extensa');
const fields = z.object({
  name: z.string().trim().min(1).max(160), slug: z.string().trim().min(1).max(60).optional(), description: z.string().max(2000).optional(),
  engine: z.enum(VOICE_AGENT_ENGINES).optional(), purpose_type: z.enum(VOICE_AGENT_PURPOSES).optional(),
  system_prompt: z.string().max(16000).optional(), first_message: z.string().max(3000).optional(), identity_disclosure: z.string().trim().min(1).max(1000).optional(),
  voice_ref_id: z.string().uuid().nullable().optional(), voice_id: z.string().max(160).nullable().optional(), voice_provider: z.string().min(1).max(80).optional(), voice_settings: json.optional(),
  language: z.string().min(2).max(40).optional(), stt_provider: z.string().min(1).max(80).optional(), llm_provider: z.string().min(1).max(80).optional(), llm_model: z.string().trim().min(1).max(160).optional(),
  temperature: z.number().min(0).max(2).optional(), max_turns: z.number().int().min(1).max(100).optional(), max_duration_seconds: z.number().int().min(30).max(3600).optional(),
  allowed_tools: z.array(z.string().refine(value => ALL_TOOL_NAMES.includes(value), 'Herramienta inválida')).max(ALL_TOOL_NAMES.length).optional(),
  guardrails: json.optional(), transfer_to_human_rules: json.optional(), business_hours: json.optional(), retry_policy: json.optional(),
  max_calls_per_day: z.number().int().min(1).max(500).optional(), max_calls_per_hour: z.number().int().min(1).max(500).optional(), is_active: z.boolean().optional(),
}).strict();
export const voiceAgentCreateSchema = fields.refine(value => Boolean(value.identity_disclosure), 'La identidad IA es obligatoria');
export const voiceAgentPatchSchema = fields.partial().refine(value => Object.keys(value).length > 0, 'No hay cambios');
export type VoiceAgentConfig = Partial<z.infer<typeof fields>>;
export function parseVoiceAgentConfig(body: unknown, create = false): VoiceAgentConfig {
  const result = (create ? voiceAgentCreateSchema : voiceAgentPatchSchema).safeParse(body);
  if (!result.success) throw new CrmHttpError(400, 'agente_invalido', result.error.issues[0]?.message ?? 'Agente inválido');
  return result.data;
}
export async function validateAgentReferences(ctx: CrmSesion, config: VoiceAgentConfig, current?: { identity_disclosure?: string | null; is_active?: boolean }) {
  if ((config.is_active ?? current?.is_active) && !(config.identity_disclosure ?? current?.identity_disclosure)?.trim()) throw new CrmHttpError(400, 'identidad_requerida', 'Configura la identidad IA antes de activar');
  if (config.voice_ref_id) {
    const { data, error } = await ctx.supabase.from('voices').select('id, kind, consent_recorded_at, is_active').eq('organization_id', ctx.organizationId).eq('id', config.voice_ref_id).maybeSingle();
    if (error) throw error;
    if (!data || !data.is_active) throw new CrmHttpError(400, 'voz_no_disponible', 'Voz no disponible');
    if (data.kind === 'cloned' && !data.consent_recorded_at) throw new CrmHttpError(400, 'voz_sin_consentimiento', 'La voz clonada requiere consentimiento');
  }
  if (config.allowed_tools) config.allowed_tools = [...new Set([...config.allowed_tools, ...MANDATORY_TOOLS])];
}
