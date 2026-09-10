import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateStageGate, type GateResult } from '@/lib/services/crm/stageGateService';
import { hasWonData, lossLabel, type LossInput } from './opportunityStageData';
import { reconcileStatus } from './opportunityStageReconcile';

export type { LossInput } from './opportunityStageData';

/**
 * opportunityStageService — único punto de cambio de etapa (FASE-09 §4.2).
 *
 * Lo usan el Kanban (drag), el drawer (StageSelect), el detalle (embudo) y,
 * en fases posteriores, F4 (aplicar análisis) y F6 (tool move_stage).
 *
 * Flujo: verificar oportunidad+etapa de la org y mismo pipeline → gate
 * (`evaluateStageGate`) → si falla y no hay `override` → { reason: 'gate' } →
 * etapa is_won/is_lost sin datos de cierre → 'needs_won' | 'needs_lost' →
 * UPDATE stage_id (+ status/closed_at/win/loss data). El trigger
 * `fn_log_stage_change` escribe `opportunity_stage_history` y
 * `trg_opp_stage_change_enqueue` emite el evento (el listener F0 crea la
 * activity `system`; el cliente NO la duplica).
 *
 * ── DECISIÓN DE ARQUITECTURA (ronda 3, F9-01/F9-31) ─────────────────────────
 * La fuente de verdad de "ganada/perdida" son `stages.is_won` / `stages.is_lost`
 * (explícitas, configurables desde el diálogo de etapa, independientes del
 * forecast). `stages.probability` es SOLO informativa (peso del forecast).
 *
 * **La invariante la garantiza ahora la BASE DE DATOS, no este servicio.**
 * `fn_sync_status_from_stage` (verificado en `pg_proc` el 2026-09-09) deriva
 * `status` de `coalesce(is_won,false)` / `coalesce(is_lost,false)`, NUNCA
 * escribe `closed_at` y **no deriva un desenlace terminal cuando faltan los
 * datos de cierre**: sin `win_data` no marca ganada, sin motivo no marca
 * perdida, y deja la oportunidad ABIERTA sobre la etapa terminal. Ese estado es
 * recuperable y lo resuelve la interfaz exigiendo el modal de cierre.
 *
 * Se hizo en la BD y no aquí porque hay tres rutas más que escriben `stage_id`
 * sin `status` (`callAnalysisService`, `opportunitiesService.moveToStage`,
 * `voiceAgentTools`): por cualquiera de ellas habría vuelto el cierre sin datos
 * y la comisión devengada sobre una venta vacía (F9-31).
 *
 * Consecuencia para este archivo: `reconcileStatus` **ya no es la garantía**,
 * es solo una red de seguridad para un despliegue con la función antigua. Corre
 * con guarda optimista y NUNCA revierte un cierre ajeno que traiga datos de
 * cierre válidos (F9-35).
 *
 * `override` se registra en `opportunities.metadata.gate_overrides[]` y exige
 * permiso de excepción de etapa (lo comprueba la ruta, F9-11/F9-36).
 */

export interface ChangeStageParams {
  opportunityId: string;
  stageId: string;
  override?: boolean;
  overrideReason?: string;
  wonData?: Record<string, unknown>;
  lossData?: LossInput;
}

export type ChangeStageResult =
  | { ok: true; opportunity: Record<string, unknown>; stage: { id: string; name: string; is_won: boolean; is_lost: boolean }; gate: GateResult | null; overridden: boolean }
  | { ok: false; reason: 'gate'; gate: GateResult; stage: { id: string; name: string } }
  | { ok: false; reason: 'needs_won' | 'needs_lost'; stage: { id: string; name: string } }
  | { ok: false; reason: 'not_found' | 'stage_not_found' | 'pipeline_mismatch' | 'same_stage' | 'conflict' };

interface OppRow {
  id: string;
  pipeline_id: string;
  stage_id: string;
  status: string | null;
  closed_at: string | null;
  updated_at: string | null;
  metadata: Record<string, unknown> | null;
}

interface StageRow {
  id: string;
  name: string;
  pipeline_id: string;
  is_won: boolean | null;
  is_lost: boolean | null;
}

const OPP_SELECT = 'id, pipeline_id, stage_id, status, closed_at, updated_at, metadata';

async function readOpportunity(supabase: SupabaseClient, orgId: number, id: string): Promise<OppRow | null> {
  const { data } = await supabase
    .from('opportunities')
    .select(OPP_SELECT)
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();
  return (data as OppRow | null) ?? null;
}

export async function changeStage(
  orgId: number,
  userId: string,
  params: ChangeStageParams,
  supabase: SupabaseClient
): Promise<ChangeStageResult> {
  const opp = await readOpportunity(supabase, orgId, params.opportunityId);
  if (!opp) return { ok: false, reason: 'not_found' };
  const o = opp;

  // F9-27: la etapa se resuelve dentro de la organización (no solo por RLS),
  // para que el servicio siga siendo seguro si F4/F6 lo llaman con service-role.
  const { data: stage } = await supabase
    .from('stages')
    .select('id, name, pipeline_id, is_won, is_lost, pipelines!inner(id, organization_id)')
    .eq('id', params.stageId)
    .eq('pipelines.organization_id', orgId)
    .maybeSingle();
  if (!stage) return { ok: false, reason: 'stage_not_found' };
  const s = stage as unknown as StageRow;
  if (s.pipeline_id !== o.pipeline_id) return { ok: false, reason: 'pipeline_mismatch' };
  // F9-37: `{}` es *truthy*. Con `!params.wonData` un `won_data:{}` se saltaba
  // esta guarda y, sobre una etapa no terminal, reabría un cierre en silencio
  // (status='open', closed_at=null) dejando `win_data` huérfano. El criterio de
  // "hay datos de cierre" tiene que ser el MISMO que usa el cierre real.
  if (s.id === o.stage_id && !hasWonData(params.wonData) && !lossLabel(params.lossData)) {
    return { ok: false, reason: 'same_stage' };
  }

  const stageInfo = { id: s.id, name: s.name, is_won: Boolean(s.is_won), is_lost: Boolean(s.is_lost) };

  // Gate (soft): si falla la evaluación, no bloquea
  let gate: GateResult | null = null;
  let gateError = false;
  try {
    gate = await evaluateStageGate(supabase, orgId, { opportunityId: o.id, targetStageId: s.id });
  } catch (err) {
    gateError = true;
    console.warn('[opportunityStageService] gate no evaluable:', err);
  }
  if (gate && !gate.ok && gate.missing.length > 0 && !params.override) {
    return { ok: false, reason: 'gate', gate, stage: stageInfo };
  }

  if (stageInfo.is_won && !hasWonData(params.wonData)) return { ok: false, reason: 'needs_won', stage: stageInfo };
  if (stageInfo.is_lost && !lossLabel(params.lossData)) return { ok: false, reason: 'needs_lost', stage: stageInfo };

  const now = new Date().toISOString();
  const build = (base: OppRow): Record<string, unknown> => {
    const update: Record<string, unknown> = { stage_id: s.id, updated_at: now };
    const metadata: Record<string, unknown> = { ...(base.metadata ?? {}) };
    let touchedMetadata = false;

    // F9-22 (r1: "override sin traza"): se registra SIEMPRE que se usa, incluso
    // si el gate no fue evaluable o vino `ok` — así queda auditable.
    if (params.override) {
      const overrides = Array.isArray(metadata.gate_overrides) ? [...(metadata.gate_overrides as unknown[])] : [];
      overrides.push({
        at: now,
        by: userId,
        from_stage_id: base.stage_id,
        to_stage_id: s.id,
        missing: gate?.missing ?? [],
        gate_evaluated: !gateError,
        reason: params.overrideReason ?? null,
      });
      metadata.gate_overrides = overrides.slice(-20);
      touchedMetadata = true;
    }

    if (stageInfo.is_won) {
      update.status = 'won';
      update.closed_at = now;
      update.win_data = params.wonData ?? {};
    } else if (stageInfo.is_lost) {
      const l = params.lossData as LossInput;
      const label = lossLabel(l);
      update.status = 'lost';
      update.closed_at = now;
      update.loss_reason = label;
      update.loss_reason_value = l.lossReasonId || label;
      update.competitor_name = l.competitor ?? null;
      update.competitor_price = l.competitorPrice ?? null;
      update.missing_features = l.missingFeatures ?? null;
      update.recontact_at = l.recontactDate ?? null;
      if (l.notes) {
        metadata.loss_notes = l.notes;
        touchedMetadata = true;
      }
    } else {
      // Etapa NO terminal: la oportunidad queda abierta pase lo que pase con
      // `probability` (F9-01). Nunca se deja `closed_at` sin razón/datos.
      update.status = 'open';
      update.closed_at = null;
    }
    if (touchedMetadata) update.metadata = metadata;
    return update;
  };

  // F9-13: escritura optimista sobre `updated_at`; si otro PATCH ganó la
  // carrera se relee y se reintenta una vez (no se pisan `gate_overrides`).
  let current = o;
  let updated: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < 2 && !updated; attempt++) {
    const update = build(current);
    let q = supabase.from('opportunities').update(update).eq('id', current.id).eq('organization_id', orgId);
    if (current.updated_at) q = q.eq('updated_at', current.updated_at);
    const { data, error } = await q.select('*').maybeSingle();
    if (error) throw new Error(`No se pudo cambiar la etapa: ${error.message}`);
    if (data) {
      updated = data as Record<string, unknown>;
      break;
    }
    const fresh = await readOpportunity(supabase, orgId, current.id);
    if (!fresh) return { ok: false, reason: 'not_found' };
    current = fresh;
  }
  if (!updated) return { ok: false, reason: 'conflict' };

  const reconciled = await reconcileStatus(supabase, orgId, current.id, stageInfo, now, updated);
  return { ok: true, opportunity: reconciled, stage: stageInfo, gate, overridden: Boolean(params.override) };
}

