/**
 * CRM ola 1 — traducción ÚNICA del resultado de `changeStage` a HTTP.
 *
 * La usan `PATCH …/stage`, `POST …/win` y `POST …/lose`: los tres pasan por
 * `opportunityStageService.changeStage` (único punto de cambio de etapa) y
 * deben responder igual ante el gate, los datos de cierre y la carrera.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChangeStageResult } from './opportunityStageService';
import { CrmHttpError } from './crmRouteSupport';
import { buscarEtapaDeDesenlace } from './opportunityStageDesenlace';

/** Datos de pérdida estructurados (`LossInput` de opportunityStageData). */
export const lossDataSchema = z.object({
  lossReasonId: z.string().max(120).optional(),
  lossReasonLabel: z.string().max(200).optional(),
  competitor: z.string().max(200).optional(),
  competitorPrice: z.number().optional(),
  missingFeatures: z.array(z.string().max(200)).max(50).optional(),
  recontactDate: z.string().optional(),
  notes: z.string().max(5000).optional(),
});

/**
 * Etapa de desenlace del pipeline de la oportunidad: la indicada (si es del
 * mismo pipeline y del tipo pedido) o la primera por `position`. 409 si el
 * pipeline no tiene ninguna: «perder» SIEMPRE mueve a una etapa `is_lost`
 * (plan §4.8), nunca deja la oportunidad perdida en una etapa abierta.
 */
export async function etapaDeDesenlace(
  supabase: SupabaseClient,
  pipelineId: string,
  tipo: 'won' | 'lost',
  stageId?: string,
): Promise<string> {
  const id = await buscarEtapaDeDesenlace(supabase, pipelineId, tipo, stageId);
  if (!id) {
    if (stageId) throw new CrmHttpError(400, 'etapa_no_valida', `La etapa indicada no es de ${tipo === 'won' ? 'ganada' : 'pérdida'} en este pipeline`);
    const code = tipo === 'won' ? 'sin_etapa_ganada' : 'sin_etapa_perdida';
    throw new CrmHttpError(409, code, `El pipeline no tiene etapa de ${tipo === 'won' ? 'ganada' : 'pérdida'}; configúrala antes de cerrar`);
  }
  return id;
}

export function respuestaCambioEtapa(result: ChangeStageResult): NextResponse {
  if (result.ok) {
    return NextResponse.json({ success: true, data: result }, { status: 200 });
  }
  switch (result.reason) {
    case 'gate':
      return NextResponse.json({ success: false, reason: 'gate', gate: result.gate, stage: result.stage, error: 'Faltan criterios para la etapa' }, { status: 409 });
    case 'needs_won':
    case 'needs_lost':
      return NextResponse.json({ success: false, reason: result.reason, stage: result.stage, error: 'La etapa requiere datos de cierre' }, { status: 409 });
    case 'conflict':
      return NextResponse.json({ success: false, reason: 'conflict', error: 'La oportunidad cambió mientras se guardaba; vuelve a intentarlo' }, { status: 409 });
    case 'not_found':
    case 'stage_not_found':
      return NextResponse.json({ success: false, reason: result.reason, error: 'No encontrado' }, { status: 404 });
    case 'same_stage':
    case 'pipeline_mismatch':
    default:
      return NextResponse.json({ success: false, reason: result.reason, error: 'Etapa no válida para esta oportunidad' }, { status: 400 });
  }
}
