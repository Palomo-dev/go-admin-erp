/**
 * Servicio CRM — Timeline unificado v2 (FASE-09 §3/§4).
 *
 * Fuentes (8): activities, tasks, notes, calls, email_messages, messages
 * (WhatsApp agrupado por conversación/día), voice_agent_calls y
 * opportunity_stage_history.
 *
 * Reglas:
 * - La fila de `activities` es la entrada canónica: si una activity tiene
 *   call_id / email_message_id / message_id, la fila de calls / email_messages /
 *   messages NO se muestra por separado (de-duplicación en TS).
 * - Cambios de etapa: el listener F0 (`stageChangedActivity`) crea una activity
 *   `system` con `metadata.stage_history_id`; la fila de stage_history con ese id
 *   se omite. Si el runner aún no la procesó, se muestra la fila de historial.
 * - Cursor estable `(occurred_at, id)` en base64url. Cada fuente se consulta con
 *   `limit + 1` **estrictamente por debajo** del cursor y devuelve su `tail`
 *   (fila más antigua leída) si podría tener más. La página se corta en el
 *   `tail` más reciente de todas las fuentes: por debajo de ese punto otra
 *   fuente podría intercalar filas aún no leídas.
 * - RLS: se usa el cliente de sesión que recibe; `organization_id` siempre de
 *   sesión (filtro adicional, no barrera).
 *
 * Ronda 2 — correcciones del informe TEST-F9-r1:
 * - F9-02: `next_cursor` ya no se pierde con filas pendientes (el corte usa el
 *   número de filas crudas, no el de filas supervivientes al filtro).
 * - F9-03/F9-10: los timestamps NULL se tratan como epoch en la consulta, en el
 *   orden (`NULLS LAST`) y en el mapeo — el cursor nunca vale `"null|id"`.
 * - Si el corte seguro deja la página vacía pero queda cursor, se reintenta
 *   internamente (hasta `MAX_ROUNDS`) para no devolver páginas vacías al cliente.
 *
 * Nota: la RPC `fn_crm_timeline` propuesta en FASE-09 §3.1 no existe (no DDL
 * desde este agente). Ver informe F9-r2 "Petición a DB".
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { compareDesc, decodeCursor, encodeCursor, isBefore, type Ctx, type Raw, type SourceResult, type TimelineEntityType, type TimelineEntry, type TimelineKind, type TimelineQuery, type TimelineResult } from './timeline/types';
import { fetchActivities, fetchCalls, fetchEmails, fetchNotes, fetchStageHistory, fetchTasks, fetchVoiceAgentCalls, fetchWhatsApp, resolveKinds } from './timeline/sources';
import { assemble, dedupeRaw, hydrate } from './timeline/assemble';

export * from './timeline/types';
export { dedupeRaw } from './timeline/assemble';

// ─── API pública ─────────────────────────────────────────────────────────────

const SOURCE_KINDS: Record<string, TimelineKind[]> = {
  activities: ['call', 'call_live', 'email', 'ai_call', 'meeting', 'note', 'sms', 'system', 'activity'],
  tasks: ['task'],
  notes: ['note'],
  calls: ['call', 'call_live'],
  emails: ['email'],
  whatsapp: ['whatsapp'],
  voice_agent_calls: ['ai_call'],
  stage_history: ['system'],
};

/** Reintentos internos cuando el corte seguro deja la página vacía. */
const MAX_ROUNDS = 5;

/**
 * Verifica que la entidad pertenece a la organización y devuelve datos
 * mínimos para la ventana de mensajes. Lanza `TimelineEntityNotFoundError`.
 */
export class TimelineEntityNotFoundError extends Error {
  constructor() {
    super('Entidad no encontrada en la organización');
    this.name = 'TimelineEntityNotFoundError';
  }
}

async function loadEntity(ctx: Omit<Ctx, 'customerId' | 'windowFrom'>): Promise<{ customerId: string | null; windowFrom: string | null }> {
  if (ctx.entityType === 'opportunity') {
    const { data } = await ctx.supabase
      .from('opportunities')
      .select('id, customer_id, created_at')
      .eq('id', ctx.entityId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle();
    if (!data) throw new TimelineEntityNotFoundError();
    const created = data.created_at ? Date.parse(data.created_at) : Date.now();
    // Ventana: 7 días antes de crear la oportunidad (conversaciones que la originaron)
    return { customerId: data.customer_id ?? null, windowFrom: new Date(created - 7 * 86400_000).toISOString() };
  }
  const { data } = await ctx.supabase
    .from('customers')
    .select('id')
    .eq('id', ctx.entityId)
    .eq('organization_id', ctx.orgId)
    .maybeSingle();
  if (!data) throw new TimelineEntityNotFoundError();
  return { customerId: ctx.entityId, windowFrom: null };
}

interface RoundResult {
  page: Raw[];
  /** Posición desde la que continuar; null cuando no queda nada. */
  next: { at: string; id: string } | null;
}

/** Una ronda: consulta las fuentes activas, deduplica y corta en el `tail` seguro. */
async function collectRound(ctx: Ctx, kinds: Set<TimelineKind>): Promise<RoundResult> {
  const wants = (src: string) => SOURCE_KINDS[src].some((k) => kinds.has(k));
  const empty: SourceResult = { rows: [], tail: null };

  const results = await Promise.all([
    wants('activities') ? fetchActivities(ctx) : empty,
    wants('tasks') ? fetchTasks(ctx) : empty,
    wants('notes') ? fetchNotes(ctx) : empty,
    wants('calls') ? fetchCalls(ctx) : empty,
    wants('emails') ? fetchEmails(ctx) : empty,
    wants('whatsapp') ? fetchWhatsApp(ctx) : empty,
    wants('voice_agent_calls') ? fetchVoiceAgentCalls(ctx) : empty,
    wants('stage_history') ? fetchStageHistory(ctx) : empty,
  ]);

  const deduped = dedupeRaw(results.flatMap((r) => r.rows)).filter((r) => kinds.has(r.kind));
  deduped.sort(compareDesc);

  // Punto seguro: la cola MÁS RECIENTE entre las fuentes que podrían tener más.
  const tails = results.map((r) => r.tail).filter(Boolean) as Raw[];
  tails.sort(compareDesc);
  const safe = tails[0] ?? null;
  const safeEnd = safe
    ? (() => {
        const idx = deduped.findIndex((r) => isBefore(r, { at: safe.occurred_at, id: safe.id }));
        return idx >= 0 ? idx : deduped.length;
      })()
    : deduped.length;

  const page = deduped.slice(0, Math.min(ctx.limit, safeEnd));
  const last = page[page.length - 1];
  if (page.length < deduped.length && last) return { page, next: { at: last.occurred_at, id: last.id } };
  // Se mostró todo lo leído (o el corte dejó la página vacía): se continúa
  // desde el propio punto seguro, que ya se emitió o quedó por encima.
  if (safe) return { page, next: { at: safe.occurred_at, id: safe.id } };
  return { page, next: null };
}

export async function getTimeline(
  orgId: number,
  entityType: TimelineEntityType,
  entityId: string,
  supabase: SupabaseClient,
  q: TimelineQuery = {}
): Promise<TimelineResult> {
  const limit = Math.min(Math.max(q.limit ?? 30, 1), 50);
  const kinds = resolveKinds(q);
  let cursor = q.cursor ? decodeCursor(q.cursor) : null;
  const partial = { orgId, entityType, entityId, supabase, limit, cursor, q };
  const entity = await loadEntity(partial);

  let page: Raw[] = [];
  let next: { at: string; id: string } | null = null;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const ctx: Ctx = { ...partial, cursor, ...entity };
    const res = await collectRound(ctx, kinds);
    page = res.page;
    next = res.next;
    if (page.length > 0 || !next) break;
    cursor = next; // corte seguro sin nada que mostrar: seguir bajando
  }

  const ctx: Ctx = { ...partial, cursor, ...entity };
  const hydration = await hydrate(page, ctx);
  const entries = page.map((r) => assemble(r, hydration)).filter(Boolean) as TimelineEntry[];
  return { entries, next_cursor: next ? encodeCursor(next.at, next.id) : null };
}

/**
 * Devuelve el conjunto de filas crudas de una página sin hidratar (para tests
 * de merge/cursor/dedupe). No usar en producción.
 */
export const __internal = { dedupeRaw, resolveKinds, compareDesc, isBefore };
