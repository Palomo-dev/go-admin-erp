import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
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
 * También actualiza `opportunities.last_contact_at/contact_channel/contact_result/temperature`
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
  /** Fila de la llamada ya cargada (evita el SELECT). */
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
  const run = (previous ? previous.catch(() => null) : Promise.resolve(null)).then(() => upsertCallActivityUnlocked(orgId, callId, opts));
  activityLocks.set(key, run);
  try {
    return await run;
  } finally {
    if (activityLocks.get(key) === run) activityLocks.delete(key);
  }
}

async function upsertCallActivityUnlocked(orgId: number, callId: string, opts: UpsertCallActivityOptions = {}): Promise<{ activityId: string; created: boolean } | null> {
  const sb = opts.supabase ?? getServiceClient();
  let call = opts.call ?? null;
  if (!call) {
    const { data } = await sb
      .from('calls')
      .select('id, organization_id, direction, mode, status, answered_by, started_at, ended_at, duration_seconds, customer_id, opportunity_id, user_id')
      .eq('id', callId)
      .eq('organization_id', orgId)
      .maybeSingle();
    call = (data as CallRowForActivity | null) ?? null;
  }
  if (!call) return null;
  const enrich = opts.enrich ?? {};

  const { data: existingRow } = await sb.from('activities').select('id, notes, metadata').eq('organization_id', orgId).eq('call_id', callId).order('created_at', { ascending: true }).limit(1).maybeSingle();
  const existing = existingRow as { id: string; notes: string | null; metadata: Record<string, unknown> | null } | null;

  // F3: una disposición manual (metadata.disposition_outcome) no se pisa por el análisis IA.
  const dispositionOutcome = typeof existing?.metadata?.disposition_outcome === 'string' ? (existing.metadata.disposition_outcome as string) : null;
  const outcome = enrich.outcome ?? dispositionOutcome ?? mapCallStatusToOutcome(call.status, call.answered_by);
  const relatedType = call.opportunity_id ? 'opportunity' : call.customer_id ? 'customer' : null;
  const relatedId = call.opportunity_id ?? call.customer_id ?? null;
  const metadata = buildActivityMetadata(existing?.metadata, call, enrich);
  const notes = enrich.summary ?? existing?.notes ?? defaultNotes(call, outcome as CallOutcome);

  if (existing) {
    const { error } = await sb
      .from('activities')
      .update({
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
    if (error) throw new Error(`activities update falló: ${error.message}`);
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
    if (again) return { activityId: (again as { id: string }).id, created: false };
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
 * Actualiza la oportunidad tras la llamada: último contacto, canal, resultado
 * y temperatura (solo si viene definida). No pisa discovery aquí (lo hace applyAnalysis).
 */
export async function touchOpportunityFromCall(
  orgId: number,
  call: CallRowForActivity,
  patch: { contactResult: string; temperature?: string | null },
  supabase?: SupabaseClient,
): Promise<boolean> {
  if (!call.opportunity_id) return false;
  const sb = supabase ?? getServiceClient();
  const update: Record<string, unknown> = {
    last_contact_at: call.ended_at ?? call.started_at ?? new Date().toISOString(),
    contact_channel: 'call',
    contact_result: patch.contactResult,
    updated_at: new Date().toISOString(),
  };
  if (patch.temperature && ['cold', 'warm', 'hot'].includes(patch.temperature)) update.temperature = patch.temperature;
  const { error } = await sb.from('opportunities').update(update).eq('id', call.opportunity_id).eq('organization_id', orgId);
  if (error) {
    console.warn('[callActivityService] touchOpportunityFromCall:', error.message);
    return false;
  }
  return true;
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
