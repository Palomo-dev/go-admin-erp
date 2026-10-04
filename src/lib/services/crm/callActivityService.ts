import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { isTerminalStatus } from './callStateMachine';
import { assertLegacyFilterBudget, isAtomicCallRpcEnabled } from './callMutationService';
import { CrmHttpError } from './crmErrors';
import { ACTIVITY_TYPES } from '@/lib/crm/enums';
import { assertDbEnum, NOTIFICATION_CHANNEL_VALUES } from '@/lib/services/crm/callAnalysisRules';

/**
 * Servicio CRM — FASE 4: actividad automática de la llamada. SOLO SERVIDOR.
 *
 * Deja UNA `activities` por llamada (idempotente por `call_id`, columna F0):
 * activity_type 'call', channel 'phone' (o 'voice_ai' para agentes),
 * outcome desde calls.status/answered_by, duration_seconds, user_id,
 * occurred_at = calls.started_at, related_type/related_id desde la
 * oportunidad (o el cliente), notes = resumen del análisis, metadata con ids.
 * El trigger canónico actualiza contacto en cliente y oportunidad con occurred_at
 * y notifica al vendedor con `fn_create_org_notification`.
 */

/**
 * Literales de columnas con CHECK real, validados en tiempo de carga del módulo
 * (ronda 3, tester r2 nº 5: la regla de `callAnalysisRules.ts` decía que ningún
 * literal se escribía suelto y aquí sí se escribían dos).
 *
 * `activities_activity_type_check` = call|email|whatsapp|sms|meeting|visit|note|
 * system|ai_call|task; `notifications_channel_check` = email|push|whatsapp|sms|
 * webhook|app (ambos reconfirmados con `pg_constraint` el 2026-09-09).
 */
export const CALL_ACTIVITY_TYPE = assertDbEnum('call', ACTIVITY_TYPES, 'activities.activity_type');
export const CALL_NOTIFICATION_CHANNEL = assertDbEnum('app', NOTIFICATION_CHANNEL_VALUES, 'notifications.channel');
export const ACTIVITY_FILTER_COLUMNS = ['id', 'organization_id', 'metadata', 'notes', 'outcome', 'duration_seconds', 'channel', 'related_type', 'related_id', 'user_id', 'occurred_at', 'updated_at'] as const;

export interface CallActivityEnrichment {
  summary?: string | null;
  sentiment?: string | null;
  qualityScore?: number | null;
  temperature?: string | null;
  transcriptId?: string | null;
  analysisId?: string | null;
  nextSteps?: unknown[] | null;
  tags?: string[] | null;
  recordingId?: string | null;
  outcome?: string | null;
}

export interface CallRowForActivity {
  id: string;
  organization_id: number;
  direction: string;
  mode: string | null;
  status: string;
  answered_by: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  customer_id: string | null;
  opportunity_id: string | null;
  user_id: string | null;
  branch_id?: number | null;
  metadata?: Record<string, unknown> | null;
}

export type CallOutcome = 'answered' | 'voicemail' | 'no_answer' | 'busy' | 'failed' | 'canceled' | 'in_progress' | 'unknown';

/** calls.status + answered_by → outcome legible. */
export function mapCallStatusToOutcome(status: string | null | undefined, answeredBy?: string | null): CallOutcome {
  switch (status) {
    case 'completed':
      return answeredBy === 'machine' ? 'voicemail' : 'answered';
    case 'voicemail':
      return 'voicemail';
    case 'no_answer':
      return 'no_answer';
    case 'busy':
      return 'busy';
    case 'failed':
      return 'failed';
    case 'canceled':
      return 'canceled';
    case 'dialing':
    case 'ringing':
    case 'in_progress':
      return 'in_progress';
    default:
      return 'unknown';
  }
}

export type CallActivityChannel = 'phone' | 'voice_ai' | 'mobile';

/**
 * Canal de la actividad según el modo de la llamada. ÚNICA fuente de verdad:
 * `callActivitySync.activityChannelForMode` (F3) delega aquí.
 *
 * Ronda 2 (tester r1 nº 15): F3 escribía `mobile` para `bridge` y F4 `phone`, y
 * la misma llamada quedaba con un canal u otro según qué ruta la tocara primero.
 * Se unifica en `mobile` porque en modo puente la llamada sale por el celular
 * personal del vendedor, que es justo lo que ese canal distingue.
 */
export function callChannel(mode: string | null | undefined): CallActivityChannel {
  if (mode === 'ai_agent') return 'voice_ai';
  if (mode === 'bridge') return 'mobile';
  return 'phone';
}

/** Metadata de la actividad (pura; testeable). */
export function buildActivityMetadata(existing: Record<string, unknown> | null | undefined, call: CallRowForActivity, enrich: CallActivityEnrichment): Record<string, unknown> {
  const meta: Record<string, unknown> = { ...(existing ?? {}), call_id: call.id, direction: call.direction, mode: call.mode, call_status: call.status, source: 'call_ai' };
  const set = (k: string, v: unknown) => {
    if (v !== undefined && v !== null) meta[k] = v;
  };
  set('transcript_id', enrich.transcriptId);
  set('analysis_id', enrich.analysisId);
  set('sentiment', enrich.sentiment);
  set('quality_score', enrich.qualityScore);
  set('temperature', enrich.temperature);
  set('next_steps', enrich.nextSteps);
  set('tags', enrich.tags);
  set('recording_id', enrich.recordingId);
  return meta;
}

export interface UpsertCallActivityOptions {
  supabase?: SupabaseClient;
  enrich?: CallActivityEnrichment;
  /** Snapshot inicial compatible con consumidores antiguos; se relee la fila antes de escribir. */
  call?: CallRowForActivity;
}

/**
 * Serializa los upserts concurrentes de la MISMA llamada dentro del proceso.
 *
 * Ronda 2 (tester r1 nº 6): dos escrituras a la vez —el webhook de estado de F3 y
 * el job `analyze` de F4— creaban DOS actividades.
 *
 * Ronda 3 (verificado hoy con `pg_indexes`): el índice
 * `activities_call_id_uidx` —UNIQUE parcial `(call_id) WHERE call_id IS NOT NULL`—
 * YA existe y es quien cierra la carrera ENTRE procesos. Este cerrojo sigue
 * siendo útil dentro del mismo worker (evita el ida y vuelta a Postgres) y la
 * recuperación por relectura tras el INSERT cubre el conflicto real.
 */
const activityLocks = new Map<string, Promise<{ activityId: string; created: boolean } | null>>();

/**
 * Crea o actualiza la actividad de la llamada. Devuelve el id y si se creó.
 * Idempotente por `call_id` incluso con llamadas concurrentes.
 */
export async function upsertCallActivity(orgId: number, callId: string, opts: UpsertCallActivityOptions = {}): Promise<{ activityId: string; created: boolean } | null> {
  const key = `${orgId}:${callId}`;
  const previous = activityLocks.get(key);
  const run = (previous ? previous.catch(() => null) : Promise.resolve(null)).then(async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try { return await upsertCallActivityUnlocked(orgId, callId, opts); }
      catch (error) {
        if (!(error instanceof CrmHttpError) || error.code !== 'actividad_de_llamada_cambiada' || attempt === 2) throw error;
      }
    }
    return null;
  });
  activityLocks.set(key, run);
  try {
    return await run;
  } finally {
    if (activityLocks.get(key) === run) activityLocks.delete(key);
  }
}

async function upsertCallActivityUnlocked(orgId: number, callId: string, opts: UpsertCallActivityOptions = {}): Promise<{ activityId: string; created: boolean } | null> {
  const sb = opts.supabase ?? getServiceClient();
  const enrich = opts.enrich ?? {};
  if (isAtomicCallRpcEnabled()) {
    const { data, error } = await sb.rpc('fn_crm_sync_llamada_servicio', {
      p_org: orgId, p_call: callId, p_enrich: enrich,
    });
    if (error) throw error;
    const result = data as { activity_id?: unknown; created?: unknown } | null;
    if (result?.activity_id === null) return null;
    if (typeof result?.activity_id !== 'string' || typeof result.created !== 'boolean') throw new Error('Respuesta inválida al sincronizar la llamada');
    return { activityId: result.activity_id, created: result.created };
  }

  // La disposición actual proviene de la fila persistida, nunca del snapshot de un job.
  const { data: storedCall, error: callError } = await sb.from('calls')
    .select('id, organization_id, direction, mode, status, answered_by, started_at, ended_at, duration_seconds, customer_id, opportunity_id, user_id, metadata')
    .eq('id', callId).eq('organization_id', orgId).maybeSingle();
  if (callError) throw callError;
  const call = storedCall as CallRowForActivity | null;
  if (!call || !isTerminalStatus(call.status) || !call.ended_at) return null;
  const started = Date.parse(call.started_at ?? '');
  const ended = Date.parse(call.ended_at);
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started || ended > Date.now()) {
    throw new CrmHttpError(400, 'fecha_llamada_invalida', 'La llamada completada debe tener un inicio y un final válidos en el pasado');
  }

  const { data: existingRow, error: activityError } = await sb.from('activities').select('*').eq('organization_id', orgId).eq('call_id', callId).order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (activityError) throw activityError;
  const existing = existingRow as ({ id: string; notes: string | null; metadata: Record<string, unknown> | null } & Record<string, unknown>) | null;

  // F3: una disposición manual (metadata.disposition_outcome) no se pisa por el análisis IA.
  const callDisposition = typeof call.metadata?.disposition_outcome === 'string' ? call.metadata.disposition_outcome : null;
  const activityDisposition = typeof existing?.metadata?.disposition_outcome === 'string' ? existing.metadata.disposition_outcome : null;
  const callDispositionAt = Date.parse(String(call.metadata?.disposition_at ?? ''));
  const activityDispositionAt = Date.parse(String(existing?.metadata?.disposition_at ?? ''));
  const useActivityDisposition = Boolean(activityDisposition) && (!callDisposition ||
    (Number.isFinite(activityDispositionAt) && (!Number.isFinite(callDispositionAt) || activityDispositionAt > callDispositionAt)));
  const dispositionOutcome = useActivityDisposition ? activityDisposition : callDisposition ?? activityDisposition;
  const outcome = dispositionOutcome ?? enrich.outcome ?? mapCallStatusToOutcome(call.status, call.answered_by);
  const relatedType = call.opportunity_id ? 'opportunity' : call.customer_id ? 'customer' : null;
  const relatedId = call.opportunity_id ?? call.customer_id ?? null;
  const metadata = buildActivityMetadata(existing?.metadata, call, enrich);
  const dispositionNote = typeof call.metadata?.disposition_note === 'string' ? call.metadata.disposition_note : null;
  if (callDisposition && !useActivityDisposition) {
    metadata.disposition_outcome = callDisposition;
    metadata.disposition_at = call.metadata?.disposition_at;
    metadata.disposition_next_action = call.metadata?.disposition_next_action;
  }
  const manualNotes = useActivityDisposition ? existing?.notes : dispositionNote;
  const liveNote = typeof call.metadata?.live_note === 'string' ? call.metadata.live_note : null;
  const uploadedNote = typeof call.metadata?.notes === 'string' ? call.metadata.notes : null;
  const notes = manualNotes ?? enrich.summary ?? liveNote ?? uploadedNote ?? existing?.notes ?? defaultNotes(call, outcome as CallOutcome);

  if (existing) assertLegacyFilterBudget({ ...existing, organization_id: orgId }, ACTIVITY_FILTER_COLUMNS, 'id');
  assertLegacyFilterBudget({ ...existing, id: existing?.id ?? callId, organization_id: orgId, metadata, notes, outcome, duration_seconds: call.duration_seconds, channel: callChannel(call.mode), related_type: relatedType, related_id: relatedId, user_id: call.user_id, occurred_at: call.started_at }, ACTIVITY_FILTER_COLUMNS, 'id');
  if (existing) {
    let update = sb.from('activities').update({
        notes,
        metadata,
        outcome,
        duration_seconds: call.duration_seconds ?? null,
        channel: callChannel(call.mode),
        related_type: relatedType,
        related_id: relatedId,
        user_id: call.user_id ?? undefined,
        occurred_at: call.started_at ?? undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .eq('organization_id', orgId);
    // Otro proceso puede haber enriquecido la misma fila entre lectura y escritura.
    for (const column of ACTIVITY_FILTER_COLUMNS.filter((column) => column !== 'id' && column !== 'organization_id')) {
      const value = existing[column];
      if (value === undefined) continue;
      update = value === null ? update.is(column, null) : update.eq(column, column === 'metadata' ? JSON.stringify(value) : value);
    }
    const { data: saved, error } = await update.select('id').maybeSingle();
    if (error) throw error;
    if (!saved) throw new CrmHttpError(409, 'actividad_de_llamada_cambiada', 'El historial de la llamada cambió mientras se guardaba');
    return { activityId: existing.id, created: false };
  }

  const { data: created, error } = await sb
    .from('activities')
    .insert({
      organization_id: orgId,
      activity_type: CALL_ACTIVITY_TYPE,
      call_id: callId,
      channel: callChannel(call.mode),
      outcome,
      duration_seconds: call.duration_seconds ?? null,
      user_id: call.user_id ?? null,
      occurred_at: call.started_at ?? new Date().toISOString(),
      related_type: relatedType,
      related_id: relatedId,
      notes,
      metadata,
    })
    .select('id')
    .single();
  if (error || !created) {
    // Carrera entre procesos (o el UNIQUE de call_id ya aplicado por DB): si otro
    // insert ganó, se reutiliza su fila en vez de propagar el error.
    const { data: again } = await sb.from('activities').select('id').eq('organization_id', orgId).eq('call_id', callId).order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (again) throw new CrmHttpError(409, 'actividad_de_llamada_cambiada', 'Se creó el historial en otro proceso');
    throw new Error(`activities insert falló: ${error?.message ?? 'sin datos'}`);
  }
  return { activityId: (created as { id: string }).id, created: true };
}

function defaultNotes(call: CallRowForActivity, outcome: CallOutcome): string {
  const dir = call.direction === 'inbound' ? 'Llamada entrante' : 'Llamada saliente';
  const dur = call.duration_seconds ? ` · ${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, '0')}` : '';
  const out: Record<CallOutcome, string> = { answered: 'contestada', voicemail: 'buzón de voz', no_answer: 'sin respuesta', busy: 'ocupado', failed: 'fallida', canceled: 'cancelada', in_progress: 'en curso', unknown: '' };
  return `${dir}${dur}${out[outcome] ? ` · ${out[outcome]}` : ''}`;
}

/**
 * Notifica al vendedor (salesperson de la oportunidad o usuario de la llamada)
 * con `fn_create_org_notification(p_organization_id, p_recipient_user_id, p_channel, p_type, p_title, p_content, p_metadata)`.
 */
export async function notifyCallAnalyzed(
  orgId: number,
  call: CallRowForActivity,
  info: { analysisId: string; summary: string | null; suggestions: number; policy: 'auto' | 'suggest'; movedStage?: boolean; customerName?: string | null; salespersonId?: string | null },
  supabase?: SupabaseClient,
): Promise<string | null> {
  const sb = supabase ?? getServiceClient();
  const recipient = info.salespersonId ?? call.user_id ?? null;
  if (!recipient) return null;
  const who = info.customerName ? ` con ${info.customerName}` : '';
  const title = info.policy === 'auto'
    ? (info.movedStage ? `Llamada${who} analizada: etapa actualizada` : `Llamada${who} analizada`)
    : `${info.suggestions} sugerencia${info.suggestions === 1 ? '' : 's'} de la llamada${who}`;
  const content = (info.summary ?? 'Revisa el resumen y las sugerencias del análisis IA.').slice(0, 500);
  const { data, error } = await sb.rpc('fn_create_org_notification', {
    p_organization_id: orgId,
    p_recipient_user_id: recipient,
    p_channel: CALL_NOTIFICATION_CHANNEL,
    p_type: 'call_analyzed',
    p_title: title,
    p_content: content,
    p_metadata: { call_id: call.id, analysis_id: info.analysisId, opportunity_id: call.opportunity_id, customer_id: call.customer_id, policy: info.policy, link: '/app/crm/llamadas' },
  });
  if (error) {
    console.warn('[callActivityService] fn_create_org_notification:', error.message);
    return null;
  }
  return (data as string) ?? null;
}
