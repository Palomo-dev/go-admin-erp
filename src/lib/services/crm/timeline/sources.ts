/**
 * Timeline v2 — consultas por fuente: activities, tasks, notes, calls,
 * email_messages, voice_agent_calls y opportunity_stage_history (la fuente
 * WhatsApp vive en `./whatsappSource.ts`). Cada una devuelve `limit + 1` filas
 * estrictamente por debajo del cursor y su cola segura (FASE-09 §4.2).
 *
 * Ronda 2 (correcciones del informe TEST-F9-r1):
 * - F9-02/F9-03/F9-10: cursor estricto `(col,id) < (at,id)` y `col IS NULL`
 *   tratado como epoch — ver `./cursor.ts`.
 * - F9-06: TODAS las fuentes desempatan por `id` en SQL y ordenan
 *   `NULLS LAST` en descendente (Postgres pone NULLS FIRST por defecto en DESC).
 * - F9-07: se pagina por la MISMA columna que se muestra (emails y llamadas IA
 *   filtraban por `created_at` y mostraban `sent_at`/`started_at`, así que las
 *   filas con desfase no salían nunca).
 * - F9-08: `channels` filtra de verdad las activities genéricas por
 *   `activities.channel`.
 *
 * Convención de construcción: primero los filtros (`eq`, rango, cursor) y al
 * final `order` + `limit`. Es indiferente para PostgREST, pero deja explícito
 * que el `limit + 1` se aplica sobre el conjunto ya filtrado.
 */
import {
  TIMELINE_KINDS,
  type Ctx, type Raw, type Row, type SourceResult, type TimelineKind, type TimelineQuery,
} from './types';
import { applyRange, atOr, DESC_NULLS_LAST, finish, ID_DESC } from './cursor';

export { applyRange, finish } from './cursor';
export { fetchWhatsApp } from './whatsappSource';

// ─── Mapeo de canales → kinds ────────────────────────────────────────────────

const CHANNEL_TO_KINDS: Record<string, TimelineKind[]> = {
  phone: ['call', 'call_live', 'ai_call'],
  call: ['call', 'call_live'],
  voice_ai: ['ai_call'],
  ai_call: ['ai_call'],
  email: ['email'],
  whatsapp: ['whatsapp'],
  sms: ['sms'],
  meeting: ['meeting'],
};

export function resolveKinds(q: TimelineQuery): Set<TimelineKind> {
  let kinds = new Set<TimelineKind>(q.kinds && q.kinds.length ? q.kinds : TIMELINE_KINDS);
  if (q.channels && q.channels.length) {
    const byChannel = new Set<TimelineKind>();
    for (const c of q.channels) {
      for (const k of CHANNEL_TO_KINDS[c] ?? []) byChannel.add(k);
      // Las activities genéricas se admiten aquí y se filtran luego por
      // `activities.channel` en `fetchActivities` (F9-08).
      byChannel.add('activity');
    }
    kinds = new Set([...kinds].filter((k) => byChannel.has(k)));
  }
  return kinds;
}

/** Conjunto de canales pedidos (null = sin filtro). */
function channelSet(ctx: Ctx): Set<string> | null {
  return ctx.q.channels && ctx.q.channels.length ? new Set(ctx.q.channels) : null;
}

export async function fetchActivities(ctx: Ctx): Promise<SourceResult> {
  let q = ctx.supabase
    .from('activities')
    .select('id, activity_type, notes, user_id, occurred_at, metadata, channel, outcome, duration_seconds, call_id, email_message_id, message_id, conversation_id')
    .eq('organization_id', ctx.orgId)
    .eq('related_type', ctx.entityType)
    .eq('related_id', ctx.entityId);
  q = applyRange(q, 'occurred_at', ctx);
  if (ctx.q.userId) q = q.eq('user_id', ctx.q.userId);
  const { data, error } = await q
    .order('occurred_at', DESC_NULLS_LAST)
    .order('id', ID_DESC)
    .limit(ctx.limit + 1);
  if (error) throw new Error(`timeline/activities: ${error.message}`);
  const raw = (data ?? []) as Row[];
  const rows: Raw[] = raw.map((r) => ({
    kind: activityKind(r.activity_type),
    id: r.id,
    occurred_at: atOr(r.occurred_at),
    user_id: r.user_id ?? null,
    row: r,
  }));
  // F9-08: `channels` filtra las activities genéricas (visita, tarea manual…).
  // F9-30: se pasa como predicado a `finish` para que la cola siga saliendo de
  // las filas LEÍDAS; filtrarlas antes hacía que una página entera de canales
  // no pedidos declarase la fuente agotada y truncase el timeline en silencio.
  const chans = channelSet(ctx);
  const keep = chans
    ? (r: Raw) => r.kind !== 'activity' || (r.row.channel != null && chans.has(String(r.row.channel)))
    : undefined;
  return finish(rows, ctx, raw.length, keep);
}

function activityKind(type: string): TimelineKind {
  switch (type) {
    case 'call': return 'call';
    case 'email': return 'email';
    case 'ai_call': return 'ai_call';
    case 'meeting': return 'meeting';
    case 'note': return 'note';
    case 'sms': return 'sms';
    case 'system': return 'system';
    default: return 'activity'; // whatsapp/visit/task manuales → tarjeta genérica
  }
}

export async function fetchTasks(ctx: Ctx): Promise<SourceResult> {
  let q = ctx.supabase
    .from('tasks')
    .select('id, title, description, assigned_to, due_date, status, priority, created_at, completed_at')
    .eq('organization_id', ctx.orgId)
    .eq('related_to_type', ctx.entityType)
    .eq('related_to_id', ctx.entityId);
  q = applyRange(q, 'created_at', ctx);
  if (ctx.q.userId) q = q.eq('assigned_to', ctx.q.userId);
  const { data, error } = await q
    .order('created_at', DESC_NULLS_LAST)
    .order('id', ID_DESC)
    .limit(ctx.limit + 1);
  if (error) throw new Error(`timeline/tasks: ${error.message}`);
  const raw = (data ?? []) as Row[];
  const rows: Raw[] = raw.map((r) => ({
    kind: 'task', id: r.id, occurred_at: atOr(r.created_at), user_id: r.assigned_to ?? null, row: r,
  }));
  return finish(rows, ctx, raw.length);
}

export async function fetchNotes(ctx: Ctx): Promise<SourceResult> {
  let q = ctx.supabase
    .from('notes')
    .select('id, body, user_id, created_at, is_pinned')
    .eq('organization_id', ctx.orgId)
    .eq('related_type', ctx.entityType)
    .eq('related_id', ctx.entityId);
  q = applyRange(q, 'created_at', ctx);
  if (ctx.q.userId) q = q.eq('user_id', ctx.q.userId);
  const { data, error } = await q
    .order('created_at', DESC_NULLS_LAST)
    .order('id', ID_DESC)
    .limit(ctx.limit + 1);
  if (error) throw new Error(`timeline/notes: ${error.message}`);
  const raw = (data ?? []) as Row[];
  const rows: Raw[] = raw.map((r) => ({
    kind: 'note', id: r.id, occurred_at: atOr(r.created_at), user_id: r.user_id ?? null, row: r,
  }));
  return finish(rows, ctx, raw.length);
}

export const CALL_SELECT =
  'id, direction, status, mode, duration_seconds, from_number, to_number, recording_enabled, cost_amount, started_at, user_id, ' +
  'call_recordings(id, status), call_transcripts(id, status), ' +
  'call_analyses(id, summary, sentiment, quality_score, suggested_stage_id, next_steps, created_at)';

export const LIVE_STATUSES = ['dialing', 'ringing', 'in_progress'];

export async function fetchCalls(ctx: Ctx): Promise<SourceResult> {
  const col = ctx.entityType === 'opportunity' ? 'opportunity_id' : 'customer_id';
  let q = ctx.supabase
    .from('calls')
    .select(CALL_SELECT)
    .eq('organization_id', ctx.orgId)
    .eq(col, ctx.entityId);
  q = applyRange(q, 'started_at', ctx);
  if (ctx.q.userId) q = q.eq('user_id', ctx.q.userId);
  const { data, error } = await q
    .order('started_at', DESC_NULLS_LAST)
    .order('id', ID_DESC)
    .limit(ctx.limit + 1);
  if (error) throw new Error(`timeline/calls: ${error.message}`);
  const raw = (data ?? []) as Row[];
  const rows: Raw[] = raw.map((r) => ({
    kind: LIVE_STATUSES.includes(r.status) ? 'call_live' : 'call',
    id: r.id,
    occurred_at: atOr(r.started_at),
    user_id: r.user_id ?? null,
    row: r,
  }));
  return finish(rows, ctx, raw.length);
}

export async function fetchEmails(ctx: Ctx): Promise<SourceResult> {
  if (ctx.q.userId) return { rows: [], tail: null }; // email_messages no tiene user_id
  // F9-07: se pagina y se muestra por `created_at`; `sent_at` sigue en el
  // payload (`TimelineEmailData.sent_at`) para que la tarjeta indique el envío.
  let q = ctx.supabase
    .from('email_messages')
    .select('id, subject, to_email, from_email, status, sent_at, created_at, open_count, click_count, body_html_snapshot')
    .eq('organization_id', ctx.orgId)
    .eq('related_type', ctx.entityType)
    .eq('related_id', ctx.entityId);
  q = applyRange(q, 'created_at', ctx);
  const { data, error } = await q
    .order('created_at', DESC_NULLS_LAST)
    .order('id', ID_DESC)
    .limit(ctx.limit + 1);
  if (error) throw new Error(`timeline/email_messages: ${error.message}`);
  const raw = (data ?? []) as Row[];
  const rows: Raw[] = raw.map((r) => ({
    kind: 'email', id: r.id, occurred_at: atOr(r.created_at), user_id: null, row: r,
  }));
  return finish(rows, ctx, raw.length);
}

export async function fetchVoiceAgentCalls(ctx: Ctx): Promise<SourceResult> {
  if (ctx.q.userId) return { rows: [], tail: null };
  const col = ctx.entityType === 'opportunity' ? 'opportunity_id' : 'customer_id';
  // F9-07: se pagina y se muestra por `created_at` (`started_at`/`scheduled_at`
  // siguen en la fila para el detalle de la tarjeta).
  let q = ctx.supabase
    .from('voice_agent_calls')
    .select('id, call_id, status, outcome, duration_seconds, turns_count, conversation_log, started_at, scheduled_at, created_at, voice_agents(id, name)')
    .eq('organization_id', ctx.orgId)
    .eq(col, ctx.entityId);
  q = applyRange(q, 'created_at', ctx);
  const { data, error } = await q
    .order('created_at', DESC_NULLS_LAST)
    .order('id', ID_DESC)
    .limit(ctx.limit + 1);
  if (error) throw new Error(`timeline/voice_agent_calls: ${error.message}`);
  const raw = (data ?? []) as Row[];
  const rows: Raw[] = raw.map((r) => ({
    kind: 'ai_call', id: r.id, occurred_at: atOr(r.created_at), user_id: null, row: r,
  }));
  return finish(rows, ctx, raw.length);
}

export async function fetchStageHistory(ctx: Ctx): Promise<SourceResult> {
  if (ctx.entityType !== 'opportunity') return { rows: [], tail: null };
  let q = ctx.supabase
    .from('opportunity_stage_history')
    .select('id, from_stage_id, to_stage_id, changed_by, changed_at')
    .eq('organization_id', ctx.orgId)
    .eq('opportunity_id', ctx.entityId);
  q = applyRange(q, 'changed_at', ctx);
  if (ctx.q.userId) q = q.eq('changed_by', ctx.q.userId);
  const { data, error } = await q
    .order('changed_at', DESC_NULLS_LAST)
    .order('id', ID_DESC)
    .limit(ctx.limit + 1);
  if (error) throw new Error(`timeline/opportunity_stage_history: ${error.message}`);
  const raw = (data ?? []) as Row[];
  const rows: Raw[] = raw.map((r) => ({
    kind: 'system', id: r.id, occurred_at: atOr(r.changed_at), user_id: r.changed_by ?? null, row: r,
  }));
  return finish(rows, ctx, raw.length);
}
