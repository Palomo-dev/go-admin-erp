/**
 * CRM ola 1 · D3 — score del lead calculado por el SERVIDOR desde el ICP.
 *
 * `customers.lead_score` (0–100) y `customers.icp_band` salen de los perfiles
 * ICP de la organización (`icpService.evaluateICP`, la única evaluación: regla
 * dura 7) sobre los datos del cliente y el valor estimado del lead (un lead ya
 * no tiene oportunidad, D2). Sin perfiles ICP no se inventa un número: el score
 * queda NULL y solo se guarda la banda de respaldo si el llamador la trae (p.
 * ej. la prioridad A/B/C del archivo importado).
 *
 * Nunca hace fallar el alta del lead: un error se registra y se devuelve null.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateICP, type OpportunityData, type ICPEvaluationResult } from './icpService';

export interface LeadScoreContext {
  organizationId: number;
  supabase: SupabaseClient;
}

export interface LeadScore {
  lead_score: number | null;
  icp_band: string | null;
}

/** Mejor evaluación: la de mayor fit que cumple los requisitos; si ninguna, sin banda. */
export async function calcularLeadScore(ctx: LeadScoreContext, customerId: string, valor: OpportunityData = {}): Promise<LeadScore> {
  const evaluaciones = await evaluateICP(ctx.organizationId, customerId, ctx.supabase, valor);
  return scoreDesdeEvaluaciones(evaluaciones);
}

export function scoreDesdeEvaluaciones(evaluaciones: readonly ICPEvaluationResult[]): LeadScore {
  if (evaluaciones.length === 0) return { lead_score: null, icp_band: null };
  const mejor = evaluaciones.find((e) => e.matched) ?? evaluaciones[0];
  return {
    lead_score: Math.max(0, Math.min(100, Math.round(mejor.fit_score))),
    icp_band: mejor.matched ? mejor.band : null,
  };
}

/**
 * Calcula y guarda `lead_score` / `icp_band` en el cliente. `bandaRespaldo`
 * solo se usa si el ICP no da banda. Devuelve lo guardado o null si falló.
 */
export async function guardarLeadScore(
  ctx: LeadScoreContext,
  customerId: string,
  valor: OpportunityData = {},
  bandaRespaldo: string | null = null,
): Promise<LeadScore | null> {
  try {
    const score = await calcularLeadScore(ctx, customerId, valor);
    const icp_band = score.icp_band ?? bandaRespaldo;
    if (score.lead_score === null && icp_band === null) return score;
    const cambios: Record<string, unknown> = { icp_band };
    if (score.lead_score !== null) cambios.lead_score = score.lead_score;
    const { error } = await ctx.supabase.from('customers').update(cambios).eq('id', customerId).eq('organization_id', ctx.organizationId);
    if (error) throw error;
    return { lead_score: score.lead_score, icp_band };
  } catch (e) {
    console.warn('[leadScore] no se pudo calcular el score del cliente %s (org %s): %s', customerId, ctx.organizationId, e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e));
    return null;
  }
}
