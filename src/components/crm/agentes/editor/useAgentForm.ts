"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MANDATORY_TOOLS } from '@/lib/services/crm/voiceAgentToolCatalog';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { VoiceCatalogRow } from '../useVoiceCatalog';
export type AgentDraft = { mode: "create" } | { mode: "edit"; id: string };

export interface AgentFormState {
  name: string;
  purpose_type: string;
  system_prompt: string;
  first_message: string;
  identity_disclosure: string;
  language: string;
  llm_model: string;
  temperature: number;
  max_turns: number;
  max_duration_seconds: number;
  voice_ref_id: string | null;
  voice_id: string;
  voice_provider: string;
  stt_provider: string;
  allowed_tools: string[];
  is_active: boolean;
  engine: string;
  voice_settings: Record<string, unknown>;
  guardrails: Record<string, unknown>;
  transfer_to_human_rules: Record<string, unknown>;
  business_hours: Record<string, unknown>;
  max_calls_per_day: number;
  max_calls_per_hour: number;
}

/**
 * Valores de un agente nuevo. `llm_model` nace vacío a propósito: lo rellena el
 * catálogo de modelos (`useAgentModels`), nunca una constante.
 */
export const EMPTY_AGENT_FORM: AgentFormState = {
  name: "",
  purpose_type: "qualify_lead",
  system_prompt: "",
  first_message: "",
  identity_disclosure: "",
  language: "es-CO",
  llm_model: "",
  temperature: 0.7,
  max_turns: 20,
  max_duration_seconds: 300,
  voice_ref_id: null,
  voice_id: "",
  voice_provider: "elevenlabs",
  stt_provider: "deepgram",
  allowed_tools: ["get_customer_context", "log_consent_opt_out", "end_call"],
  is_active: false,
  engine: "conversation_relay", voice_settings: {}, guardrails: {}, transfer_to_human_rules: {}, business_hours: {}, max_calls_per_day: 60, max_calls_per_hour: 20,
};

export function agentFormFromApi(d: Record<string, unknown>): AgentFormState {
  const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return {
    name: str(d.name, ""),
    purpose_type: str(d.purpose_type, "custom"),
    system_prompt: str(d.system_prompt, ""),
    first_message: str(d.first_message, ""),
    identity_disclosure: str(d.identity_disclosure, ""),
    language: str(d.language, "es-CO"),
    llm_model: str(d.llm_model, ""),
    temperature: Number(d.temperature ?? 0.7),
    max_turns: num(d.max_turns, 20),
    max_duration_seconds: num(d.max_duration_seconds, 300),
    voice_ref_id: typeof d.voice_ref_id === "string" && d.voice_ref_id ? d.voice_ref_id : null,
    voice_id: str(d.voice_id, ""),
    voice_provider: str(d.voice_provider, "elevenlabs"),
    stt_provider: str(d.stt_provider, "deepgram"),
    allowed_tools: Array.isArray(d.allowed_tools) ? (d.allowed_tools as string[]) : [],
    is_active: d.is_active !== false,
    engine: str(d.engine, "conversation_relay"), voice_settings: (d.voice_settings ?? {}) as Record<string, unknown>, guardrails: (d.guardrails ?? {}) as Record<string, unknown>, transfer_to_human_rules: (d.transfer_to_human_rules ?? {}) as Record<string, unknown>, business_hours: (d.business_hours ?? {}) as Record<string, unknown>, max_calls_per_day: num(d.max_calls_per_day, 60), max_calls_per_hour: num(d.max_calls_per_hour, 20),
  };
}

/**
 * Cuerpo que viaja a la API: el identificador suelto vacío se manda como `null`;
 * el modelo vacío se omite (manda el DEFAULT de la columna, nunca `""`); las
 * herramientas obligatorias viajan siempre, como las pinta la casilla bloqueada.
 */
export function agentFormToBody(form: AgentFormState): Record<string, unknown> {
  const llm_model = form.llm_model.trim();
  return {
    ...form,
    voice_id: form.voice_id.trim() || null,
    allowed_tools: [...new Set([...form.allowed_tools, ...MANDATORY_TOOLS])],
    ...(llm_model ? { llm_model } : { llm_model: undefined }),
  };
}

// F-NEW-7 (D9 · Ley 1581): registrar una baja voluntaria y poder colgar no son
// opcionales. La casilla se muestra marcada y bloqueada; el runtime las añade
// igualmente aunque alguien las quite por otro camino.
export const isMandatoryTool = (tool: string) =>
  (MANDATORY_TOOLS as readonly string[]).includes(tool);

export function toggleAllowedTool(tools: string[], tool: string, on: boolean): string[] {
  if (isMandatoryTool(tool)) return tools;
  return on ? [...new Set([...tools, tool])] : tools.filter((t) => t !== tool);
}

export type EffectiveVoice =
  | { source: "agent"; voice: VoiceCatalogRow }
  | { source: "default"; voice: VoiceCatalogRow }
  | { source: "loose"; voiceId: string }
  | { source: "standard" };

/**
 * Espejo en cliente de `resolveVoice` del runtime: voz del agente si está
 * activa → voz por defecto activa → identificador suelto → voz estándar.
 */
export function resolveEffectiveVoice(
  form: Pick<AgentFormState, "voice_ref_id" | "voice_id">,
  voices: VoiceCatalogRow[],
): EffectiveVoice {
  const own = form.voice_ref_id
    ? voices.find((v) => v.id === form.voice_ref_id && v.is_active)
    : undefined;
  if (own) return { source: "agent", voice: own };
  if (!form.voice_ref_id) {
    const def = voices.find((v) => v.is_default && v.is_active);
    if (def) return { source: "default", voice: def };
  }
  if (form.voice_id.trim()) return { source: "loose", voiceId: form.voice_id.trim() };
  return { source: "standard" };
}

export interface AgentFormApi {
  form: AgentFormState; setForm: React.Dispatch<React.SetStateAction<AgentFormState>>;
  patch: (partial: Partial<AgentFormState>) => void; loading: boolean; saving: boolean;
  error: string | null; loadFailed: boolean; validate: () => boolean; reload: () => void; persistedId: string | null; save: (inactive?: boolean) => Promise<boolean>;
}
export function useAgentForm(draft: AgentDraft): AgentFormApi {
  const t = useTranslations('crm.agentesIa');
  const [form, setForm] = useState<AgentFormState>(EMPTY_AGENT_FORM);
  const [loading, setLoading] = useState(draft.mode === 'edit');
  const [loadFailed, setLoadFailed] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const [persistedId, setId] = useState(draft.mode === 'edit' ? draft.id : null);
  const [reloadKey, setReload] = useState(0); const revision = useRef(0); const lock = useRef(false);
  const patch = useCallback((partial: Partial<AgentFormState>) => setForm(f => ({ ...f, ...partial })), []);
  const draftId = draft.mode === 'edit' ? draft.id : null;
  useEffect(() => {
    const current = ++revision.current; setError(null); setLoadFailed(false); setId(draftId);
    if (!draftId) { setForm(EMPTY_AGENT_FORM); setLoading(false); return () => { revision.current = current + 1; }; }
    setLoading(true);
    pedirCrm<Record<string, unknown>>(`/api/crm/voice-agents/${draftId}`).then(result => { if (current === revision.current) setForm(agentFormFromApi(result.data)); }).catch(() => { if (current === revision.current) { setLoadFailed(true); setError(t('loadError')); } }).finally(() => { if (current === revision.current) setLoading(false); });
    return () => { revision.current = current + 1; };
  }, [draftId, reloadKey, t]);
  const validate = useCallback(() => { const valid = Boolean(form.name.trim() && form.identity_disclosure.trim() && form.llm_model.trim()); setError(valid ? null : t('required')); return valid; }, [form, t]);
  const save = useCallback(async (inactive = false) => {
    if (lock.current || loading || loadFailed || !validate()) return false;
    const current = revision.current; lock.current = true; setSaving(true); setError(null);
    try {
      const body = agentFormToBody(inactive ? { ...form, is_active: false } : form);
      const result = await pedirCrm<{ id: string }>(persistedId ? `/api/crm/voice-agents/${persistedId}` : '/api/crm/voice-agents', { method: persistedId ? 'PATCH' : 'POST', cuerpo: body });
      if (current !== revision.current) return false;
      setId(result.data.id); if (inactive) patch({ is_active: false }); return true;
    } catch { if (current === revision.current) setError(t('saveError')); return false; }
    finally { lock.current = false; if (current === revision.current) setSaving(false); }
  }, [form, loading, loadFailed, persistedId, patch, t, validate]);
  return { form, setForm, patch, loading, saving, error, loadFailed, validate, persistedId, reload: () => setReload(k => k + 1), save };
}
