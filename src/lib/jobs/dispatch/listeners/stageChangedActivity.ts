import { onCrmEvent, type CrmEventListener } from '../eventDispatcher';

/**
 * Listener F0 de `opportunity.stage_changed`: deja una activity `system`
 * "Etapa cambiada de X a Y" en la oportunidad (visible en Actividades
 * recientes / timeline) de forma idempotente.
 *
 * Dedupe (en este orden):
 *  1. `activities.metadata->>stage_history_id` = fila de
 *     `opportunity_stage_history` correspondiente (misma opp, mismo to_stage,
 *     ±2 min del evento).
 *  2. Misma opp + `metadata->>to_stage_id` + `occurred_at` ±90 s. Esto cubre
 *     también la activity que hoy inserta el cliente
 *     (`OpportunityAutomations.tsx:315-330`, metadata {from_stage_id,to_stage_id})
 *     hasta que F8/F9 retiren ese path.
 *
 * Si el evento se reintenta (job failed → queued) el dedupe evita duplicados.
 */

const HISTORY_WINDOW_MS = 2 * 60 * 1000;
const ACTIVITY_WINDOW_MS = 90 * 1000;

export const LISTENER_NAME = 'stage_changed_activity';

interface StageRow {
  id: string;
  name: string;
}

export const stageChangedActivityListener: CrmEventListener = async (event, { supabase, orgId, log }) => {
  if (event.entity_type !== 'opportunity') return { skipped: true, reason: 'entity_not_opportunity' };

  const toStageId = typeof event.payload.to_stage_id === 'string' ? event.payload.to_stage_id : null;
  const fromStageId = typeof event.payload.from_stage_id === 'string' ? event.payload.from_stage_id : null;
  if (!toStageId) return { skipped: true, reason: 'no_to_stage' };

  // crm_events no tiene occurred_at: created_at es el momento del evento (trigger AFTER UPDATE).
  const occurredAt = event.created_at;
  const occurredMs = new Date(occurredAt).getTime();
  const iso = (ms: number) => new Date(ms).toISOString();

  // 1) fila de historial equivalente
  const { data: history, error: hErr } = await supabase
    .from('opportunity_stage_history')
    .select('id, changed_by, changed_at')
    .eq('organization_id', orgId)
    .eq('opportunity_id', event.entity_id)
    .eq('to_stage_id', toStageId)
    .gte('changed_at', iso(occurredMs - HISTORY_WINDOW_MS))
    .lte('changed_at', iso(occurredMs + HISTORY_WINDOW_MS))
    .order('changed_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; changed_by: string | null; changed_at: string }>();
  if (hErr) throw new Error(`opportunity_stage_history: ${hErr.message}`);

  if (history) {
    const { data: byHistory, error: e1 } = await supabase
      .from('activities')
      .select('id')
      .eq('organization_id', orgId)
      .eq('related_type', 'opportunity')
      .eq('related_id', event.entity_id)
      .eq('activity_type', 'system')
      .eq('metadata->>stage_history_id', history.id)
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (e1) throw new Error(`activities dedupe(history): ${e1.message}`);
    if (byHistory) return { skipped: true, reason: 'dup_stage_history', activity_id: byHistory.id };
  }

  // 2) misma opp + to_stage en ventana de ±90 s (cubre la activity del cliente)
  const { data: byWindow, error: e2 } = await supabase
    .from('activities')
    .select('id')
    .eq('organization_id', orgId)
    .eq('related_type', 'opportunity')
    .eq('related_id', event.entity_id)
    .eq('activity_type', 'system')
    .eq('metadata->>to_stage_id', toStageId)
    .gte('occurred_at', iso(occurredMs - ACTIVITY_WINDOW_MS))
    .lte('occurred_at', iso(occurredMs + ACTIVITY_WINDOW_MS))
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (e2) throw new Error(`activities dedupe(window): ${e2.message}`);
  if (byWindow) return { skipped: true, reason: 'dup_window', activity_id: byWindow.id };

  // 3) nombres de etapas
  const stageIds = [fromStageId, toStageId].filter((s): s is string => !!s);
  const { data: stages, error: sErr } = await supabase.from('stages').select('id, name').in('id', stageIds);
  if (sErr) throw new Error(`stages: ${sErr.message}`);
  const nameOf = (id: string | null) => (id ? ((stages ?? []) as StageRow[]).find((s) => s.id === id)?.name ?? 'Sin etapa' : 'Sin etapa');
  const fromName = nameOf(fromStageId);
  const toName = nameOf(toStageId);

  // `payload.changed_by` lo pone el trigger (auth.uid(); NULL con service role).
  const changedBy =
    (typeof event.payload.changed_by === 'string' ? event.payload.changed_by : null) ?? history?.changed_by ?? null;

  const { data: inserted, error: iErr } = await supabase
    .from('activities')
    .insert({
      organization_id: orgId,
      activity_type: 'system',
      user_id: changedBy,
      notes: `Etapa cambiada de ${fromName} a ${toName}`,
      related_type: 'opportunity',
      related_id: event.entity_id,
      occurred_at: occurredAt,
      metadata: {
        source: 'crm_event',
        crm_event_id: event.id,
        stage_history_id: history?.id ?? null,
        from_stage_id: fromStageId,
        to_stage_id: toStageId,
        from_stage_name: fromName,
        to_stage_name: toName,
      },
    })
    .select('id')
    .single<{ id: string }>();
  if (iErr) throw new Error(`activities insert: ${iErr.message}`);

  log.info('stage_changed_activity_created', { activity_id: inserted.id, opportunity_id: event.entity_id });
  return { activity_id: inserted.id, from: fromName, to: toName };
};

let registered = false;
export function registerStageChangedActivityListener(): void {
  if (registered) return;
  registered = true;
  onCrmEvent('opportunity.stage_changed', stageChangedActivityListener, LISTENER_NAME);
}
