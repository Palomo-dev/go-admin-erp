import type { SupabaseClient } from '@supabase/supabase-js';
import { CrmEventDispatchError, dispatchCrmEvent, getCrmEventListeners } from '../dispatch/eventDispatcher';
import { JobFatalError, JobRetryableError, type CrmEvent, type JobHandler } from '../types';

/**
 * Handler `crm_event` (FASE-00 §4.4; consumidor del outbox, tester #2).
 *
 * payload: `{ event_id: uuid }` (lo encola `fn_emit_crm_event` / el trigger
 * `trg_opp_stage_change_enqueue` con `dedupe_key = crm_event:{id}`).
 *
 *  - evento inexistente → JobFatalError (dead, no reintentable)
 *  - evento ya `processed|skipped` → `{skipped:true}` (idempotencia)
 *  - sin listeners para el tipo → `crm_events.status='skipped'`
 *  - listeners ok → `processed`; alguno falla → `failed` (+ `attempts`/`last_error`
 *    si DB-r2 ya añadió las columnas) y el job se reintenta (backoff de
 *    fn_fail_job); un evento `failed` se vuelve a procesar en el siguiente
 *    intento (solo `processed|skipped` se consideran finales). El resync de
 *    `maintenance` deja de re-encolar cuando `attempts >= 3`.
 *
 * F8 conectará aquí el motor de reglas/secuencias registrando listeners en
 * `eventDispatcher.onCrmEvent(...)`; este handler no cambia.
 */
export const crmEventHandler: JobHandler = async (ctx) => {
  const { job, supabase, orgId, log, signal } = ctx;
  const eventId = typeof job.payload.event_id === 'string' ? job.payload.event_id : null;
  if (!eventId) throw new JobFatalError('payload.event_id requerido');

  const { data: event, error } = await supabase
    .from('crm_events')
    .select('*')
    .eq('id', eventId)
    .eq('organization_id', orgId)
    .maybeSingle<CrmEvent>();

  if (error) throw new JobRetryableError(`crm_events select: ${error.message}`);
  if (!event) throw new JobFatalError(`event_not_found:${eventId}`);

  if (event.status === 'processed' || event.status === 'skipped') {
    return { skipped: true, reason: `already_${event.status}`, event_id: eventId };
  }

  const registered = getCrmEventListeners(event.event_type);
  if (!registered.length) {
    await supabase
      .from('crm_events')
      .update({ status: 'skipped', processed_at: new Date().toISOString() })
      .eq('id', eventId);
    log.info('crm_event_skipped', { event_type: event.event_type, reason: 'no_listeners' });
    return { skipped: true, reason: 'no_listeners', event_id: eventId, event_type: event.event_type };
  }

  try {
    const dispatched = await dispatchCrmEvent(event, { supabase, orgId, log, signal });
    const { error: updErr } = await supabase
      .from('crm_events')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('id', eventId);
    if (updErr) throw new JobRetryableError(`crm_events update: ${updErr.message}`);

    return {
      event_id: eventId,
      event_type: event.event_type,
      listeners: dispatched.listeners,
      results: dispatched.results.map((r) => ({ name: r.name, ok: r.ok, ms: r.ms, result: r.result ?? null })),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markEventFailed(supabase, eventId, orgId, message, event.attempts ?? 0);
    if (err instanceof CrmEventDispatchError) throw new JobRetryableError(message);
    throw err;
  }
};

/** Códigos PostgREST/Postgres de "columna desconocida" (crm_events.attempts/last_error antes de DB-r2). */
const COLUMN_MISSING_CODES = new Set(['PGRST204', '42703']);

/**
 * Marca el evento `failed` y, si las columnas de DB-r2 existen, incrementa
 * `attempts` y guarda `last_error` (≤2000 chars). Si aún no existen
 * (PGRST204/42703) repite el UPDATE solo con `status`. Nunca lanza: el error
 * de procesamiento original es el que debe propagarse.
 */
export async function markEventFailed(
  supabase: SupabaseClient,
  eventId: string,
  orgId: number,
  message: string,
  prevAttempts: number,
): Promise<void> {
  const base = supabase.from('crm_events');
  const { error } = await base
    .update({ status: 'failed', attempts: prevAttempts + 1, last_error: message.slice(0, 2000) })
    .eq('id', eventId)
    .eq('organization_id', orgId);
  if (!error) return;
  const missing = (error.code && COLUMN_MISSING_CODES.has(error.code)) || /column .* does not exist|could not find the '(attempts|last_error)' column/i.test(error.message ?? '');
  if (!missing) return; // el fallo se refleja en outbound_jobs.last_error vía el error original
  await supabase.from('crm_events').update({ status: 'failed' }).eq('id', eventId).eq('organization_id', orgId);
}
