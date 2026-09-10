/**
 * callActivitySync — una sola `activities` (activity_type 'call') por llamada.
 * GO Admin ERP — FASE-03 §2.2 paso 7 / D4 (SOLO servidor, service client).
 *
 * No existe trigger de BD; la actividad se crea/actualiza desde:
 *  - `/api/voice/status` y `/api/voice/dial-complete` al llegar a un estado terminal,
 *  - `callDispositionService.applyDisposition` (resultado, nota, próxima acción).
 *
 * Delegación: usa `callActivityService.upsertCallActivity` (F4: misma fila por
 * `activities.call_id`, la enriquece luego con transcript/análisis) pasando el
 * resultado de la disposición como `enrich.outcome` y la nota como `summary`.
 * Si F4 falla (p. ej. RLS/columna), cae a un insert/update mínimo propio.
 *
 * Clave de unicidad: `activities.call_id` (índice parcial; DB: pedir UNIQUE).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { defaultOutcomeForStatus, isTerminalStatus } from './callStateMachine';
import { upsertCallActivity as upsertRichCallActivity, callChannel, CALL_ACTIVITY_TYPE } from './callActivityService';

export interface CallForActivity {
  id: string;
  organization_id: number;
  direction: 'inbound' | 'outbound';
  mode: string;
  status: string;
  from_number: string;
  to_number: string;
  customer_id: string | null;
  opportunity_id: string | null;
  user_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  answered_by?: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Canal de la actividad. Delega en `callActivityService.callChannel` para que la
 * ruta principal (F4) y este respaldo (F3) escriban SIEMPRE el mismo valor
 * (`bridge` → `mobile`); antes divergían y la misma llamada quedaba con un canal
 * distinto según qué ruta la tocara primero (tester r1 nº 15).
 */
export function activityChannelForMode(mode: string): string {
  return callChannel(mode);
}

/** Metadata de disposición que se fusiona en `activities.metadata`. */
export function dispositionActivityMetadata(call: CallForActivity): Record<string, unknown> {
  const meta = call.metadata ?? {};
  const out: Record<string, unknown> = {
    source: 'voice',
    direction: call.direction,
    mode: call.mode,
    status: call.status,
    from: call.from_number,
    to: call.to_number,
  };
  if (meta.disposition_outcome) out.disposition_outcome = meta.disposition_outcome;
  if (meta.disposition_next_action) out.next_action = meta.disposition_next_action;
  return out;
}

/**
 * Crea o actualiza la actividad de la llamada. Devuelve el id de la actividad
 * (o null si no hay entidad relacionada o el estado no es terminal).
 */
export async function upsertCallActivity(call: CallForActivity, client: SupabaseClient): Promise<string | null> {
  if (!isTerminalStatus(call.status)) return null;
  const relatedType = call.opportunity_id ? 'opportunity' : call.customer_id ? 'customer' : null;
  const relatedId = call.opportunity_id ?? call.customer_id ?? null;
  if (!relatedType || !relatedId) return null;

  const meta = call.metadata ?? {};
  const outcome = (meta.disposition_outcome as string | undefined) || defaultOutcomeForStatus(call.status);
  const notes = (meta.disposition_note as string | undefined) || (meta.live_note as string | undefined) || null;
  const activityMeta = dispositionActivityMetadata(call);

  // 1) Ruta principal: F4 (misma fila, la enriquece después el análisis IA).
  try {
    const rich = await upsertRichCallActivity(call.organization_id, call.id, {
      supabase: client,
      call: {
        id: call.id,
        organization_id: call.organization_id,
        direction: call.direction,
        mode: call.mode,
        status: call.status,
        answered_by: call.answered_by ?? null,
        started_at: call.started_at,
        ended_at: call.ended_at,
        duration_seconds: call.duration_seconds,
        customer_id: call.customer_id,
        opportunity_id: call.opportunity_id,
        user_id: call.user_id,
      },
      enrich: { outcome, summary: notes ?? undefined },
    });
    if (rich) {
      // Fusiona la metadata de disposición (F4 conserva lo existente y añade lo suyo).
      const { data: row } = await client.from('activities').select('metadata').eq('id', rich.activityId).eq('organization_id', call.organization_id).maybeSingle();
      const prev = ((row as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
      await client
        .from('activities')
        .update({ metadata: { ...prev, ...activityMeta } })
        .eq('id', rich.activityId)
        .eq('organization_id', call.organization_id);
      return rich.activityId;
    }
  } catch (err) {
    console.warn('[callActivitySync] F4 upsert falló, usando fallback mínimo:', err instanceof Error ? err.message : err);
  }

  // 2) Fallback mínimo (idempotente por call_id).
  const { data: existing } = await client
    .from('activities')
    .select('id, metadata')
    .eq('organization_id', call.organization_id)
    .eq('call_id', call.id)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const prevMeta = ((existing as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<string, unknown>;
    const { error } = await client
      .from('activities')
      .update({
        outcome,
        notes: notes ?? undefined,
        duration_seconds: call.duration_seconds ?? null,
        metadata: { ...prevMeta, ...activityMeta },
        updated_at: new Date().toISOString(),
      })
      .eq('id', (existing as { id: string }).id)
      .eq('organization_id', call.organization_id);
    if (error) console.warn('[callActivitySync] update error:', error.message);
    return (existing as { id: string }).id;
  }

  const { data, error } = await client
    .from('activities')
    .insert({
      organization_id: call.organization_id,
      activity_type: CALL_ACTIVITY_TYPE,
      user_id: call.user_id,
      notes,
      related_type: relatedType,
      related_id: relatedId,
      occurred_at: call.started_at ?? new Date().toISOString(),
      channel: activityChannelForMode(call.mode),
      outcome,
      duration_seconds: call.duration_seconds ?? null,
      call_id: call.id,
      metadata: activityMeta,
    })
    .select('id')
    .single();
  if (error) {
    // Carrera entre status y dial-complete: si otro insert ganó, reutilizar.
    const { data: again } = await client
      .from('activities')
      .select('id')
      .eq('organization_id', call.organization_id)
      .eq('call_id', call.id)
      .limit(1)
      .maybeSingle();
    if (again) return (again as { id: string }).id;
    console.warn('[callActivitySync] insert error:', error.message);
    return null;
  }
  return (data as { id: string }).id;
}

/** Actualiza el "último contacto" de la oportunidad tras una llamada terminal. */
export async function touchOpportunityAfterCall(
  call: Pick<CallForActivity, 'organization_id' | 'opportunity_id' | 'status' | 'ended_at' | 'metadata'>,
  client: SupabaseClient
): Promise<void> {
  if (!call.opportunity_id || !isTerminalStatus(call.status)) return;
  const outcome = (call.metadata?.disposition_outcome as string | undefined) || defaultOutcomeForStatus(call.status);
  const patch: Record<string, unknown> = {
    last_contact_at: call.ended_at ?? new Date().toISOString(),
    contact_channel: 'call',
    contact_result: outcome,
  };
  const next = call.metadata?.disposition_next_action as { due_at?: string } | undefined;
  if (next?.due_at) patch.next_contact_at = next.due_at;
  const { error } = await client.from('opportunities').update(patch).eq('id', call.opportunity_id).eq('organization_id', call.organization_id);
  if (error) console.warn('[callActivitySync] opportunities update:', error.message);
}
