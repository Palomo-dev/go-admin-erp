/**
 * timelineService v2 — merge, cursor estable y de-duplicación (FASE-09 §9.1).
 * Mock de supabase con builder encadenable por tabla; cada tabla devuelve un
 * dataset fijo y el mock aplica `lte`, `order` y `limit` sobre él.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { decodeCursor, dedupeRaw, encodeCursor, getTimeline } from '../timelineService';
import { createPgMock } from './pgMock';

type Row = Record<string, any>;

interface TableData { rows: Row[]; orderCol?: string }

/**
 * Ronda 2: el mock pasa a ser el fiel de `./pgMock.ts` (NULLs, NULLS FIRST/LAST,
 * `or()` con `and()` anidado), compartido con `timelineAdversarial.test.ts`.
 */
function makeSupabase(tables: Record<string, TableData>, calls: string[] = []): SupabaseClient {
  const flat: Record<string, Row[]> = {};
  for (const [name, t] of Object.entries(tables)) flat[name] = t.rows;
  return createPgMock(flat, calls);
}

const T = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 8, h, m, 0)).toISOString();
const OPP = '11111111-1111-4111-8111-111111111111';
const CUST = '22222222-2222-4222-8222-222222222222';
const uuid = (n: number) => `${n.toString().padStart(8, '0')}-0000-4000-8000-000000000000`;

/**
 * Ronda 3 (F9-40): el simulador ya no da por buenas las columnas ausentes, así
 * que los fixtures llevan `organization_id` y las claves de relación de verdad.
 * Sin esto ningún test comprobaba el aislamiento entre organizaciones.
 */
const ORG = 7;
const withOrg = (rows: Row[], extra: Row = {}): Row[] => rows.map((r) => ({ organization_id: ORG, ...extra, ...r }));

function baseTables(): Record<string, TableData> {
  const rel = { related_type: 'opportunity', related_id: OPP };
  return {
    opportunities: { rows: withOrg([{ id: OPP, customer_id: CUST, created_at: T(0) }]) },
    activities: { rows: withOrg([
      { id: uuid(1), activity_type: 'call', notes: 'llamada', user_id: 'u1', occurred_at: T(10), metadata: {}, call_id: uuid(100), channel: 'phone', outcome: 'reached', duration_seconds: 120 },
      { id: uuid(2), activity_type: 'note', notes: 'nota act', user_id: 'u1', occurred_at: T(9), metadata: {} },
      { id: uuid(3), activity_type: 'system', notes: 'Etapa cambiada', user_id: 'u1', occurred_at: T(8), metadata: { stage_history_id: uuid(300), to_stage_id: 's2' } },
    ], rel) },
    tasks: { rows: withOrg([{ id: uuid(20), title: 'Tarea', status: 'open', priority: 'med', due_date: null, assigned_to: 'u1', created_at: T(7) }], { related_to_type: 'opportunity', related_to_id: OPP }) },
    notes: { rows: withOrg([{ id: uuid(30), body: '<p>nota</p>', user_id: 'u1', created_at: T(6), is_pinned: false }], rel) },
    calls: { rows: withOrg([
      { id: uuid(100), direction: 'outbound', status: 'completed', mode: 'browser', duration_seconds: 120, started_at: T(10), user_id: 'u1', recording_enabled: true, call_recordings: [], call_transcripts: [], call_analyses: [] },
      { id: uuid(101), direction: 'inbound', status: 'in_progress', mode: 'inbound', duration_seconds: null, started_at: T(11), user_id: 'u1', recording_enabled: true, call_recordings: [], call_transcripts: [], call_analyses: [] },
    ], { opportunity_id: OPP }) },
    email_messages: { rows: withOrg([{ id: uuid(200), subject: 'Propuesta', to_email: 'a@b.co', status: 'opened', sent_at: T(5), created_at: T(5), open_count: 2, click_count: 0, body_html_snapshot: '<p>hola</p>' }], rel) },
    email_events: { rows: withOrg([{ email_message_id: uuid(200), event_type: 'opened', occurred_at: T(5, 30) }]) },
    messages: { rows: withOrg(Array.from({ length: 7 }, (_, i) => ({ id: uuid(400 + i), conversation_id: 'conv1', channel_id: 'ch1', direction: i % 2 ? 'inbound' : 'outbound', role: i % 2 ? 'customer' : 'agent', content: `msg ${i}`, content_type: 'text', created_at: T(4, i), related_opportunity_id: OPP, conversation: { id: 'conv1', customer_id: CUST, last_inbound_at: new Date().toISOString() } }))) },
    voice_agent_calls: { rows: [] },
    opportunity_stage_history: { rows: withOrg([
      { id: uuid(300), from_stage_id: 's1', to_stage_id: 's2', changed_by: 'u1', changed_at: T(8) },
      { id: uuid(301), from_stage_id: 's0', to_stage_id: 's1', changed_by: 'u1', changed_at: T(3) },
    ], { opportunity_id: OPP }) },
    profiles: { rows: [{ id: 'u1', first_name: 'Ana', last_name: 'Pérez', avatar_url: null }] },
    stages: { rows: [{ id: 's0', name: 'Nuevo', color: '#000' }, { id: 's1', name: 'Calificado', color: '#111' }, { id: 's2', name: 'Negociación', color: '#222' }] },
    calendar_events: { rows: [] },
  };
}

describe('timelineService v2', () => {
  test('encodeCursor/decodeCursor ida y vuelta (base64url) y compatibilidad v1', () => {
    const c = encodeCursor(T(10), uuid(1));
    expect(c).not.toContain('|');
    expect(decodeCursor(c)).toEqual({ at: T(10), id: uuid(1) });
    expect(decodeCursor(`${T(10)}|${uuid(1)}`)).toEqual({ at: T(10), id: uuid(1) });
    expect(decodeCursor('no-valido')).toBeNull();
  });

  test('página 1: merge ordenado, dedupe de calls/stage_history por activity y WhatsApp agrupado', async () => {
    const calls: string[] = [];
    const sb = makeSupabase(baseTables(), calls);
    const { entries, next_cursor } = await getTimeline(7, 'opportunity', OPP, sb, { limit: 30 });
    const keys = entries.map((e) => `${e.kind}:${e.id}`);
    // la llamada 100 tiene activity → una sola entrada (kind call con id de la activity)
    expect(keys.filter((k) => k.startsWith('call:')).length).toBe(1);
    expect(keys).toContain(`call:${uuid(1)}`);
    expect(keys).not.toContain(`call:${uuid(100)}`);
    // la llamada en curso 101 (sin activity) sí aparece como call_live
    expect(keys).toContain(`call_live:${uuid(101)}`);
    // stage_history 300 deduplicada por metadata.stage_history_id; 301 se muestra
    expect(keys).not.toContain(`system:${uuid(300)}`);
    expect(keys).toContain(`system:${uuid(301)}`);
    expect(keys).toContain(`system:${uuid(3)}`);
    // WhatsApp: 7 mensajes → 1 grupo con count 7 y 5 burbujas
    const wa = entries.find((e) => e.kind === 'whatsapp');
    expect(wa && wa.kind === 'whatsapp' ? wa.count : 0).toBe(7);
    expect(wa && wa.kind === 'whatsapp' ? wa.messages.length : 0).toBe(5);
    // Orden descendente
    for (let i = 1; i < entries.length; i++) expect(Date.parse(entries[i - 1].occurred_at)).toBeGreaterThanOrEqual(Date.parse(entries[i].occurred_at));
    // Email hidratado con eventos y usuario resuelto
    const em = entries.find((e) => e.kind === 'email');
    expect(em && em.kind === 'email' ? em.events.length : 0).toBe(1);
    expect(entries.find((e) => e.kind === 'note' && e.user?.name === 'Ana Pérez')).toBeTruthy();
    // sistema 301 resuelve nombres de etapa
    const sys = entries.find((e) => e.kind === 'system' && e.id === uuid(301));
    expect(sys && sys.kind === 'system' ? sys.to_stage?.name : null).toBe('Calificado');
    expect(next_cursor).toBeNull();
    // presupuesto de consultas: entidad + 8 fuentes (+1 extra de messages) + hidratación ≤ 9
    const hydration = calls.filter((t) => ['profiles', 'stages', 'email_events', 'calendar_events'].includes(t) || calls.indexOf(t) > 9).length;
    expect(hydration).toBeLessThanOrEqual(9);
  });

  test('cursor estable: dos páginas consecutivas no repiten ni pierden entradas', async () => {
    const tables = baseTables();
    const sb = makeSupabase(tables);
    const all = await getTimeline(7, 'opportunity', OPP, sb, { limit: 50 });
    const p1 = await getTimeline(7, 'opportunity', OPP, makeSupabase(tables), { limit: 3 });
    expect(p1.entries.length).toBe(3);
    expect(p1.next_cursor).toBeTruthy();
    const p2 = await getTimeline(7, 'opportunity', OPP, makeSupabase(tables), { limit: 3, cursor: p1.next_cursor! });
    const p3 = await getTimeline(7, 'opportunity', OPP, makeSupabase(tables), { limit: 50, cursor: p2.next_cursor ?? p1.next_cursor! });
    const paged = [...p1.entries, ...p2.entries, ...(p2.next_cursor ? p3.entries : [])].map((e) => `${e.kind}:${e.id}`);
    const expected = all.entries.map((e) => `${e.kind}:${e.id}`);
    expect(new Set(paged).size).toBe(paged.length);
    expect(paged).toEqual(expected);
  });

  test('filtros: kinds=task solo consulta tasks; user_id excluye fuentes sin usuario', async () => {
    const calls: string[] = [];
    const sb = makeSupabase(baseTables(), calls);
    const r = await getTimeline(7, 'opportunity', OPP, sb, { kinds: ['task'] });
    expect(r.entries.every((e) => e.kind === 'task')).toBe(true);
    expect(calls).not.toContain('email_messages');
    expect(calls).not.toContain('messages');
    const r2 = await getTimeline(7, 'opportunity', OPP, makeSupabase(baseTables()), { userId: 'u1' });
    expect(r2.entries.some((e) => e.kind === 'email' || e.kind === 'whatsapp')).toBe(false);
  });

  test('entidad de otra org → TimelineEntityNotFoundError', async () => {
    const tables = baseTables();
    tables.opportunities = { rows: [] };
    await expect(getTimeline(7, 'opportunity', OPP, makeSupabase(tables))).rejects.toThrow('Entidad no encontrada');
  });

  test('dedupeRaw: email con activity, ai_call vs call, ventana ±120 s de cambio de etapa', () => {
    const rows = [
      { kind: 'email' as const, id: 'a1', occurred_at: T(5), user_id: null, row: { activity_type: 'email', email_message_id: 'e1', metadata: {} } },
      { kind: 'email' as const, id: 'e1', occurred_at: T(5), user_id: null, row: { subject: 'x' } },
      { kind: 'ai_call' as const, id: 'v1', occurred_at: T(6), user_id: null, row: { call_id: 'c9' } },
      { kind: 'call' as const, id: 'c9', occurred_at: T(6), user_id: null, row: { status: 'completed' } },
      { kind: 'system' as const, id: 'a2', occurred_at: T(8, 0), user_id: null, row: { activity_type: 'system', metadata: { to_stage_id: 's2' } } },
      { kind: 'system' as const, id: 'h1', occurred_at: T(8, 1), user_id: null, row: { to_stage_id: 's2' } },
      { kind: 'system' as const, id: 'h2', occurred_at: T(8, 30), user_id: null, row: { to_stage_id: 's2' } },
    ];
    const out = dedupeRaw(rows).map((r) => r.id);
    expect(out).toEqual(['a1', 'v1', 'a2', 'h2']);
  });
});
