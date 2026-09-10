/**
 * Timeline v2 — tipos públicos, cursor (base64url occurred_at|id), orden y
 * tipos internos de filas crudas (FASE-09 §4.1). Sin dependencias de Supabase.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { compareTs } from './timestamps';

// ─── Tipos públicos ──────────────────────────────────────────────────────────

export type TimelineEntityType = 'customer' | 'opportunity';

export type TimelineKind =
  | 'call'
  | 'call_live'
  | 'email'
  | 'whatsapp'
  | 'sms'
  | 'ai_call'
  | 'task'
  | 'note'
  | 'meeting'
  | 'system'
  | 'activity';

export const TIMELINE_KINDS: readonly TimelineKind[] = [
  'call', 'call_live', 'email', 'whatsapp', 'sms', 'ai_call', 'task', 'note', 'meeting', 'system', 'activity',
];

export interface TimelineUser {
  id: string;
  name: string;
  avatar_url: string | null;
}

export interface TimelineEntryBase {
  kind: TimelineKind;
  id: string;
  occurred_at: string;
  user: TimelineUser | null;
}

export interface TimelineActivityRef {
  id: string;
  activity_type: string;
  notes: string | null;
  channel: string | null;
  outcome: string | null;
  duration_seconds: number | null;
  metadata: Record<string, unknown>;
}

export interface TimelineCallData {
  id: string;
  direction: string;
  status: string;
  mode: string | null;
  duration_seconds: number | null;
  from_number: string | null;
  to_number: string | null;
  recording_enabled: boolean;
  cost_amount: number | null;
  recording: { id: string; status: string } | null;
  transcript: { id: string; status: string } | null;
  analysis: {
    id: string;
    summary: string | null;
    sentiment: string | null;
    quality_score: number | null;
    suggested_stage_id: string | null;
    next_steps: unknown;
  } | null;
}

export interface TimelineEmailData {
  id: string;
  subject: string;
  to_email: string;
  from_email: string | null;
  status: string;
  sent_at: string | null;
  open_count: number;
  click_count: number;
  body_html_snapshot: string | null;
}

export interface TimelineWhatsAppMessage {
  id: string;
  direction: string;
  role: string;
  content: string;
  content_type: string;
  created_at: string;
}

export interface TimelineTaskData {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  due_date: string | null;
  assigned_to: string | null;
}

export interface TimelineNoteData {
  id: string;
  body: string;
  is_pinned: boolean;
}

export interface TimelineMeetingEvent {
  id: string;
  start_at: string;
  end_at: string | null;
  location: string | null;
  status: string | null;
}

export interface TimelineStageRef {
  id: string;
  name: string;
  color: string | null;
}

export type TimelineEntry =
  | (TimelineEntryBase & { kind: 'call' | 'call_live'; call: TimelineCallData; activity: TimelineActivityRef | null })
  | (TimelineEntryBase & {
      kind: 'email';
      email: TimelineEmailData;
      events: Array<{ event_type: string; occurred_at: string }>;
      activity: TimelineActivityRef | null;
    })
  | (TimelineEntryBase & {
      kind: 'whatsapp';
      conversation_id: string;
      channel_id: string | null;
      customer_id: string | null;
      count: number;
      /** true si el grupo tenía más mensajes de los que `count` refleja (F9-34). */
      truncated: boolean;
      messages: TimelineWhatsAppMessage[];
      window_open: boolean;
    })
  | (TimelineEntryBase & {
      kind: 'ai_call';
      voice_agent_call: {
        id: string;
        outcome: string | null;
        status: string;
        duration_seconds: number | null;
        turns_count: number;
        conversation_log: unknown;
        agent: { id: string; name: string } | null;
      } | null;
      call: TimelineCallData | null;
      activity: TimelineActivityRef | null;
    })
  | (TimelineEntryBase & { kind: 'task'; task: TimelineTaskData })
  | (TimelineEntryBase & { kind: 'note'; note: TimelineNoteData | null; activity: TimelineActivityRef | null })
  | (TimelineEntryBase & { kind: 'meeting'; activity: TimelineActivityRef; event: TimelineMeetingEvent | null })
  | (TimelineEntryBase & { kind: 'sms'; activity: TimelineActivityRef; event: null })
  | (TimelineEntryBase & { kind: 'activity'; activity: TimelineActivityRef; event: null })
  | (TimelineEntryBase & {
      kind: 'system';
      activity: TimelineActivityRef | null;
      from_stage: TimelineStageRef | null;
      to_stage: TimelineStageRef | null;
    });

export interface TimelineQuery {
  kinds?: TimelineKind[];
  channels?: string[];
  userId?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export interface TimelineResult {
  entries: TimelineEntry[];
  next_cursor: string | null;
}

// ─── Cursor ──────────────────────────────────────────────────────────────────

function toBase64Url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, 'base64').toString('utf8');
}

export function encodeCursor(at: string, id: string): string {
  return toBase64Url(`${at}|${id}`);
}

export function decodeCursor(cursor: string): { at: string; id: string } | null {
  if (!cursor) return null;
  let raw = cursor;
  // Compatibilidad con el formato v1 (`iso|uuid` sin codificar)
  if (!cursor.includes('|')) {
    try {
      raw = fromBase64Url(cursor);
    } catch {
      return null;
    }
  }
  const idx = raw.lastIndexOf('|');
  if (idx <= 0) return null;
  const at = raw.slice(0, idx);
  const id = raw.slice(idx + 1);
  if (!at || !id || Number.isNaN(Date.parse(at))) return null;
  return { at, id };
}

/**
 * Comparación de ids por unidades de código (no `localeCompare`): es la misma
 * ordenación que aplica Postgres a `uuid` en su forma canónica en minúsculas,
 * así que el desempate en memoria coincide exactamente con el `id.lt.<uuid>`
 * que se manda en el filtro del cursor (ronda 2, F9-06).
 */
function cmpId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export { canonicalTs, compareTs, EPOCH_CANONICAL } from './timestamps';

/** Orden descendente por (occurred_at, id). */
export function compareDesc(a: { occurred_at: string; id: string }, b: { occurred_at: string; id: string }): number {
  const c = compareTs(a.occurred_at, b.occurred_at);
  if (c !== 0) return -c;
  return cmpId(b.id, a.id);
}

/** true si `row` es estrictamente más antigua que el cursor. */
export function isBefore(row: { occurred_at: string; id: string }, cursor: { at: string; id: string }): boolean {
  const c = compareTs(row.occurred_at, cursor.at);
  if (c !== 0) return c < 0;
  return cmpId(row.id, cursor.id) < 0;
}

// ─── Filas crudas ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export interface Raw {
  kind: TimelineKind;
  id: string;
  occurred_at: string;
  user_id: string | null;
  row: Row;
}

export interface SourceResult {
  rows: Raw[];
  /**
   * Fila MÁS ANTIGUA devuelta por la fuente cuando la fuente **podría tener
   * más** (Postgres cortó en `limit + 1`). `null` si la fuente se agotó.
   *
   * El servicio toma la más reciente de todas las colas como "punto seguro":
   * por debajo de ella otra fuente podría intercalar filas que aún no se han
   * leído, así que la página no puede llegar más abajo (ronda 2, F9-02).
   */
  tail: Raw | null;
}

export function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// ─── Consultas por fuente ────────────────────────────────────────────────────

export interface Ctx {
  orgId: number;
  entityType: TimelineEntityType;
  entityId: string;
  supabase: SupabaseClient;
  limit: number;
  cursor: { at: string; id: string } | null;
  q: TimelineQuery;
  customerId: string | null;
  windowFrom: string | null;
}
