/**
 * Lógica pura de la tarjeta del agente y del detalle (Figma CRM 1298:84133 y
 * 1311:86823): qué voz describe la línea del micrófono, qué etapas y política
 * van en «Guion en etapas», cómo se escriben las cifras y la duración.
 */

import type { EtapaDeAgente, MetricaPorAgente } from "@/lib/services/crm/voiceAgentMetrics";
import { politicaDeEtapas } from "@/lib/services/crm/voiceAgentMetrics";

export interface VozMinima {
  id: string;
  name: string;
  kind: string;
  consent_recorded_at: string | null;
  is_default: boolean;
}

export type DescripcionVoz =
  | { tipo: "clonada"; nombre: string }
  | { tipo: "catalogo"; nombre: string }
  | { tipo: "id"; id: string }
  | { tipo: "defectoOrg" }
  | { tipo: "sinVoz" };

/**
 * Línea del micrófono: voz propia del catálogo (clonada o no), un identificador
 * suelto, o la de la organización cuando el agente no tiene voz propia.
 */
export function describirVoz(
  agente: { voice_ref_id: string | null; voice_id: string | null },
  voces: readonly VozMinima[],
): DescripcionVoz {
  if (agente.voice_ref_id) {
    const v = voces.find((x) => x.id === agente.voice_ref_id);
    if (v) return v.kind === "cloned" ? { tipo: "clonada", nombre: v.name } : { tipo: "catalogo", nombre: v.name };
  }
  if (agente.voice_id) return { tipo: "id", id: agente.voice_id };
  return voces.some((v) => v.is_default) ? { tipo: "defectoOrg" } : { tipo: "sinVoz" };
}

/** Etapas del agente (activas primero, en el orden del embudo) y su política. */
export function guionDeAgente(agentId: string, etapas: readonly EtapaDeAgente[]) {
  const propias = etapas.filter((e) => e.voice_agent_id === agentId);
  const activas = propias.filter((e) => e.is_active);
  return {
    etapas: activas.map((e) => ({ id: e.stage_id, nombre: e.etapa })),
    politica: politicaDeEtapas(propias),
  };
}

export interface CifrasTarjeta {
  llamadas: number;
  /** `null` sin llamadas: se pinta «—». */
  contactoPct: number | null;
  /** `null` cuando no agendó nada: se pinta «—» (Figma). */
  agendadas: number | null;
}

export function cifrasDeAgente(agentId: string, porAgente: readonly MetricaPorAgente[]): CifrasTarjeta {
  const m = porAgente.find((x) => x.voice_agent_id === agentId);
  if (!m || m.llamadas === 0) return { llamadas: 0, contactoPct: null, agendadas: m?.agendadas ? m.agendadas : null };
  return {
    llamadas: m.llamadas,
    contactoPct: Math.round((m.contestadas / m.llamadas) * 100),
    agendadas: m.agendadas > 0 ? m.agendadas : null,
  };
}

/** Segundos → minutos y segundos enteros («2 min 48 s»). */
export function partirDuracion(segundos: number): { m: number; s: number } {
  const total = Math.max(0, Math.round(segundos));
  return { m: Math.floor(total / 60), s: total % 60 };
}
