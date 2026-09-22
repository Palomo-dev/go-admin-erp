"use client";

/**
 * Estado y persistencia del editor de agente IA de voz (FASE 06, UXM-D).
 *
 * Extraído de `AgentEditorDialog` para que cada pestaña sea un componente corto.
 * Las funciones puras (`agentFormFromApi`, `agentFormToBody`, `resolveEffectiveVoice`,
 * `isMandatoryTool`) se prueban sin React.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/use-toast";
import { MANDATORY_TOOLS } from "@/lib/services/crm/voiceAgentTools";
import type { VoiceCatalogRow } from "../useVoiceCatalog";

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
  is_active: true,
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
  form: AgentFormState;
  setForm: React.Dispatch<React.SetStateAction<AgentFormState>>;
  patch: (partial: Partial<AgentFormState>) => void;
  loading: boolean;
  saving: boolean;
  save: () => Promise<boolean>;
}

export function useAgentForm(draft: AgentDraft): AgentFormApi {
  const [form, setForm] = useState<AgentFormState>(EMPTY_AGENT_FORM);
  const [loading, setLoading] = useState(draft.mode === "edit");
  const [saving, setSaving] = useState(false);

  const patch = useCallback(
    (partial: Partial<AgentFormState>) => setForm((f) => ({ ...f, ...partial })),
    [],
  );

  useEffect(() => {
    if (draft.mode !== "edit") return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/crm/voice-agents/${draft.id}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || !json?.success) throw new Error(json?.error || `Error ${res.status}`);
        if (alive) setForm(agentFormFromApi(json.data ?? {}));
      } catch (err) {
        toast({
          title: "No se pudo cargar el agente",
          description: err instanceof Error ? err.message : "Error desconocido",
          variant: "destructive",
        });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [draft]);

  const save = useCallback(async () => {
    if (!form.name.trim()) {
      toast({ title: "El agente necesita un nombre", variant: "destructive" });
      return false;
    }
    if (!form.llm_model.trim()) {
      // Sin modelo la fila quedaría con `""` y el runtime la taparía con uno cableado.
      toast({
        title: "Elige el modelo de lenguaje",
        description: "Está en el paso Propósito. Si el catálogo no cargó, escribe el nombre a mano.",
        variant: "destructive",
      });
      return false;
    }
    setSaving(true);
    try {
      const url =
        draft.mode === "edit" ? `/api/crm/voice-agents/${draft.id}` : "/api/crm/voice-agents";
      const res = await fetch(url, {
        method: draft.mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agentFormToBody(form)),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || `Error ${res.status}`);
      toast({ title: draft.mode === "edit" ? "Agente actualizado" : "Agente creado" });
      return true;
    } catch (err) {
      toast({
        title: "No se pudo guardar",
        description: err instanceof Error ? err.message : "Error desconocido",
        variant: "destructive",
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [draft, form]);

  return { form, setForm, patch, loading, saving, save };
}
