/**
 * Lógica pura del editor de agentes en 5 pasos (Figma CRM 1313:773321 →
 * 1318:775924): orden de los pasos, qué falta para avanzar, el borrador que
 * viaja a la prueba y el historial de la conversación. Sin React.
 */
import type { AgentFormState } from './useAgentForm';

export const PASOS_EDITOR = ['proposito', 'etapas', 'voz', 'herramientas', 'probar'] as const;
export type PasoEditor = (typeof PASOS_EDITOR)[number];

export const numeroPaso = (p: PasoEditor): number => PASOS_EDITOR.indexOf(p) + 1;
export const pasoSiguiente = (p: PasoEditor): PasoEditor | null => PASOS_EDITOR[PASOS_EDITOR.indexOf(p) + 1] ?? null;
export const pasoAnterior = (p: PasoEditor): PasoEditor | null => PASOS_EDITOR[PASOS_EDITOR.indexOf(p) - 1] ?? null;

/** Campo obligatorio que falta (clave de `crm.agentesIa.editor.faltan.*`). */
export type FaltaPaso = 'nombre' | 'modelo';

/** Lo que impide salir del paso 1. Los demás pasos no bloquean (se puede volver atrás). */
export function faltantesPaso(form: Pick<AgentFormState, 'name' | 'llm_model'>, paso: PasoEditor): FaltaPaso[] {
  if (paso !== 'proposito') return [];
  const f: FaltaPaso[] = [];
  if (!form.name.trim()) f.push('nombre');
  if (!form.llm_model.trim()) f.push('modelo');
  return f;
}

/** El agente SIN guardar, tal como lo prueba el servidor (`voiceAgentTestService`). */
export function borradorParaPrueba(form: AgentFormState): Record<string, unknown> {
  const b: Record<string, unknown> = {
    name: form.name.trim(),
    purpose_type: form.purpose_type,
    system_prompt: form.system_prompt,
    first_message: form.first_message,
    identity_disclosure: form.identity_disclosure,
    language: form.language,
    temperature: form.temperature,
    allowed_tools: form.allowed_tools,
    max_turns: form.max_turns,
  };
  if (form.llm_model.trim()) b.llm_model = form.llm_model.trim();
  return b;
}

export interface HerramientaPrueba {
  id: string;
  name: string;
  status: 'suggested' | 'denied';
}

export interface MensajePrueba {
  rol: 'agente' | 'cliente';
  texto: string;
  herramientas?: HerramientaPrueba[];
}

/**
 * Historial que se manda al servidor: sin el saludo (el servidor lo vuelve a
 * poner, el mismo de la llamada real) y como mucho los últimos 40 turnos.
 */
export function historialParaApi(mensajes: readonly MensajePrueba[]): { role: 'user' | 'assistant'; content: string }[] {
  const sinSaludo = mensajes[0]?.rol === 'agente' ? mensajes.slice(1) : mensajes;
  return sinSaludo.slice(-40).map((m) => ({ role: m.rol === 'cliente' ? 'user' : 'assistant', content: m.texto }));
}

/**
 * Clientes FICTICIOS para la prueba (nombre y contexto en
 * `crm.agentesIa.editor.prueba.clientes.<id>`): nunca se leen fichas reales.
 */
export const CLIENTES_PRUEBA = ['interesado', 'ocupado', 'esceptico'] as const;
export type ClientePruebaId = (typeof CLIENTES_PRUEBA)[number];

// ─── Paso 2 · Guion por etapas (Figma 1313:773766) ─────────────────────────────

/** Fila de `stage_agents` tal como la devuelve `GET /api/crm/stage-agents`. */
export interface AsignacionEtapa {
  id: string;
  stage_id: string;
  voice_agent_id: string | null;
  channel?: string;
  objective: string;
  objective_prompt: string | null;
  product_id: number | null;
  offer?: Record<string, unknown>;
  trigger_on: string;
  trigger_config?: Record<string, unknown>;
  allowed_tools?: string[];
  action_policy: string;
  max_attempts?: number;
  config?: Record<string, unknown>;
  is_active: boolean;
}

export interface EtapaEmbudo {
  id: string;
  name: string;
  pipeline_id: string;
  position: number;
  is_won?: boolean;
  is_lost?: boolean;
}

export type EstadoEtapa = 'este' | 'otro' | 'libre';

export interface FilaEtapa {
  etapa: EtapaEmbudo;
  asignacion: AsignacionEtapa | null;
  estado: EstadoEtapa;
}

/**
 * Etapas del embudo elegido, en orden, sin las de cierre (ganada o perdida no
 * admiten agente), con su asignación de VOZ y si es de este agente o de otro.
 */
export function filasEtapas(
  etapas: readonly EtapaEmbudo[],
  asignaciones: readonly AsignacionEtapa[],
  pipelineId: string | null,
  agentId: string | null,
): FilaEtapa[] {
  return etapas
    .filter((e) => (!pipelineId || e.pipeline_id === pipelineId) && !e.is_won && !e.is_lost)
    .sort((a, b) => a.position - b.position)
    .map((etapa) => {
      const asignacion = asignaciones.find((a) => a.stage_id === etapa.id && (a.channel ?? 'voice') === 'voice') ?? null;
      const estado: EstadoEtapa = !asignacion || !asignacion.voice_agent_id ? 'libre' : agentId && asignacion.voice_agent_id === agentId ? 'este' : 'otro';
      return { etapa, asignacion, estado };
    });
}

export function resumenEtapas(filas: readonly FilaEtapa[]): { este: number; otro: number } {
  return { este: filas.filter((f) => f.estado === 'este').length, otro: filas.filter((f) => f.estado === 'otro').length };
}

/** Objetivos que no se pueden guardar sin un dato que este paso no pide. */
const OBJETIVOS_CON_DATO = new Set(['sell_product', 'custom']);

/** Objetivo inicial al asignar: el propósito del agente si no exige producto o descripción. */
export function objetivoInicial(purposeType: string, objetivos: readonly string[]): string {
  return objetivos.includes(purposeType) && !OBJETIVOS_CON_DATO.has(purposeType) ? purposeType : 'qualify_lead';
}

/** Motivo por el que una asignación no se puede guardar (clave de `…etapas.faltan.*`), o null. */
export function faltaEnAsignacion(a: Pick<AsignacionEtapa, 'objective' | 'objective_prompt' | 'product_id'>): 'producto' | 'descripcion' | null {
  if (a.objective === 'sell_product' && !a.product_id) return 'producto';
  if (a.objective === 'custom' && !(a.objective_prompt ?? '').trim()) return 'descripcion';
  return null;
}

const DISPARADORES = new Set(['enter', 'sla_breach', 'no_response_days', 'manual']);

/**
 * Cuerpo de `POST /api/crm/stage-agents` (la organización sale de la sesión).
 * El servidor hace un upsert por (etapa, canal) que repone a su valor por
 * defecto todo campo ausente: por eso se arrastran TODOS los campos de la fila
 * actual (oferta, disparador, herramientas, intentos, config) y solo cambia lo
 * que el usuario tocó.
 */
export function cuerpoAsignacion(
  etapaId: string,
  agentId: string,
  actual: Partial<AsignacionEtapa> | null,
  cambios: Partial<Pick<AsignacionEtapa, 'objective' | 'objective_prompt' | 'trigger_on' | 'action_policy' | 'is_active'>>,
): Record<string, unknown> {
  const m = { ...(actual ?? {}), ...cambios };
  const cuerpo: Record<string, unknown> = {
    stage_id: etapaId,
    voice_agent_id: agentId,
    channel: 'voice',
    objective: m.objective ?? 'qualify_lead',
    objective_prompt: m.objective_prompt ?? null,
    product_id: m.product_id ?? null,
    trigger_on: m.trigger_on && DISPARADORES.has(m.trigger_on) ? m.trigger_on : 'manual',
    action_policy: m.action_policy === 'auto' ? 'auto' : 'suggest',
    is_active: m.is_active !== false,
  };
  if (actual?.offer) cuerpo.offer = actual.offer;
  if (actual?.trigger_config) cuerpo.trigger_config = actual.trigger_config;
  if (actual?.allowed_tools) cuerpo.allowed_tools = actual.allowed_tools;
  if (typeof actual?.max_attempts === 'number') cuerpo.max_attempts = actual.max_attempts;
  if (actual?.config) cuerpo.config = actual.config;
  return cuerpo;
}
