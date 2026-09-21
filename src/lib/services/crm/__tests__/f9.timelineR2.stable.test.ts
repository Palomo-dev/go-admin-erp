/**
 * F9 — timeline v2: paginación, precisión de timestamptz, cola segura, tope de
 * WhatsApp y aislamiento multi-tenant (consolidado el 2026-09-21).
 *
 * Origen:
 *  - R2.1–R2.7: tester de F9 ronda 2 (`timelineR2Adversarial`), corregidos por el
 *    builder en ronda 3 (F9-30, F9-32, F9-33, F9-34, F9-40). Cada `expect`
 *    afirma el comportamiento correcto; si falla, el defecto ha vuelto.
 *  - B3.1/B3.2 y B3.4–B3.7: builder de F9 ronda 3 (`f9Round3Builder`), escritos
 *    ANTES de cada corrección: aislamiento entre organizaciones (F9-40),
 *    microsegundos en el orden y el cursor (F9-32), cola segura desde lo leído
 *    (F9-30) y tope de mensajes por entrada de WhatsApp (F9-34).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getTimeline, TimelineEntityNotFoundError } from '../timelineService';
import { canonicalTs, compareDesc, isBefore, type Ctx, type Raw } from '../timeline/types';
import { cursorFilter, finish, isoUtc } from '../timeline/cursor';
import { createPgMock, type Row } from './pgMock';

/* eslint-disable @typescript-eslint/no-explicit-any */
const T = (h: number, m = 0, s = 0) => new Date(Date.UTC(2026, 8, 8, h, m, s)).toISOString();
const OPP = '11111111-1111-4111-8111-111111111111';
const CUST = '22222222-2222-4222-8222-222222222222';
const uuid = (n: number) => `${n.toString().padStart(8, '0')}-0000-4000-8000-000000000000`;

const EMPTY: Record<string, Row[]> = {
  opportunities: [{ id: OPP, customer_id: CUST, created_at: T(0), organization_id: 1 }],
  activities: [], tasks: [], notes: [], calls: [], email_messages: [], email_events: [],
  messages: [], voice_agent_calls: [], opportunity_stage_history: [], profiles: [], stages: [], calendar_events: [],
};
const base = (over: Record<string, Row[]>): Record<string, Row[]> => ({ ...EMPTY, ...over });

async function page(sb: SupabaseClient, q: Record<string, unknown> = {}) {
  return getTimeline(1, 'opportunity', OPP, sb, q as never);
}

const act = (n: number, at: string | null, extra: Row = {}): Row => ({
  id: uuid(n), organization_id: 1, related_type: 'opportunity', related_id: OPP,
  activity_type: 'note', notes: 'x', user_id: null, occurred_at: at, metadata: {},
  channel: null, outcome: null, duration_seconds: null, call_id: null,
  email_message_id: null, message_id: null, conversation_id: null, ...extra,
});

describe('F9 · timeline v2 — paginación y filtros (de tester r2)', () => {
  // ── R2.1 · el filtro de canal introducido por F9-08 resucita F9-02 ─────────
  test('R2.1 channels: una activity que sí casa por debajo de limit+1 no-casantes debe salir', async () => {
    const activities = [
      // 31 activities genéricas con canal que NO se pide (llenan limit+1 = 31)
      ...Array.from({ length: 31 }, (_, i) => act(200 + i, T(20, 0, 59 - i), { activity_type: 'visit', channel: 'in_person' })),
      // una MÁS ANTIGUA que sí casa
      act(300, T(5), { activity_type: 'visit', channel: 'email' }),
    ];
    const seen: string[] = [];
    let cursor: string | null | undefined;
    for (let i = 0; i < 8; i++) {
      const p = await page(createPgMock(base({ activities })), { limit: 30, channels: ['email'], cursor: cursor ?? undefined });
      seen.push(...p.entries.map((e) => e.id));
      cursor = p.next_cursor;
      if (!cursor) break;
    }
    expect(seen).toContain(uuid(300));
  });

  // ── R2.2 · truncamiento de microsegundos en el cursor ─────────────────────
  test('R2.2 isoUtc/cursorFilter no deben perder los microsegundos de Postgres', () => {
    const pgTs = '2026-09-08T10:00:00.123456+00:00';
    expect(isoUtc(pgTs)).toBe('2026-09-08T10:00:00.123456Z');
    const f = cursorFilter('occurred_at', { at: pgTs, id: uuid(9) });
    // el `lt` debe usar el instante exacto; si se trunca a .123Z, toda fila con
    // occurred_at en (.123000, .123456) queda excluida para siempre
    expect(f).toContain('occurred_at.lt.2026-09-08T10:00:00.123456');
  });

  // ── R2.3 · un día de WhatsApp con más de MSG_FETCH mensajes ───────────────
  test('R2.3 conversación con 250 mensajes en un día: no se pierde el historial anterior', async () => {
    const msgs: Row[] = [];
    // 250 mensajes del 8-sep (día Bogotá) en una sola conversación
    for (let i = 0; i < 250; i++) {
      msgs.push({
        id: uuid(1000 + i), organization_id: 1, conversation_id: 'conv1', channel_id: 'ch1',
        direction: 'inbound', role: 'customer', content: `m${i}`, content_type: 'text',
        created_at: new Date(Date.UTC(2026, 8, 8, 12, 0, 0) - i * 1000).toISOString(),
        related_opportunity_id: OPP,
        conversation: { id: 'conv1', customer_id: CUST, last_inbound_at: T(12) },
      });
    }
    // y un mensaje de un día ANTERIOR, en otra conversación
    msgs.push({
      id: uuid(999), organization_id: 1, conversation_id: 'conv0', channel_id: 'ch1',
      direction: 'inbound', role: 'customer', content: 'ANTIGUO', content_type: 'text',
      created_at: new Date(Date.UTC(2026, 8, 1, 12, 0, 0)).toISOString(),
      related_opportunity_id: OPP,
      conversation: { id: 'conv0', customer_id: CUST, last_inbound_at: T(12) },
    });
    const tables = base({ messages: msgs });
    const seenConvs: string[] = [];
    let cursor: string | null | undefined;
    for (let i = 0; i < 10; i++) {
      const p = await page(createPgMock(tables), { limit: 5, cursor: cursor ?? undefined });
      for (const e of p.entries) if (e.kind === 'whatsapp') seenConvs.push((e as any).conversation_id);
      cursor = p.next_cursor;
      if (!cursor) break;
    }
    expect(seenConvs).toContain('conv0');
  });

  // ── R2.4 · un grupo indivisible puede exceder con mucho el tamaño de página ─
  test('R2.4 con limit=1 una sola entrada WhatsApp no debería cargar 200 mensajes', async () => {
    const msgs: Row[] = Array.from({ length: 250 }, (_, i) => ({
      id: uuid(2000 + i), organization_id: 1, conversation_id: 'convX', channel_id: 'ch1',
      direction: 'inbound', role: 'customer', content: `m${i}`, content_type: 'text',
      created_at: new Date(Date.UTC(2026, 8, 8, 12, 0, 0) - i * 1000).toISOString(),
      related_opportunity_id: OPP,
      conversation: { id: 'convX', customer_id: CUST, last_inbound_at: T(12) },
    }));
    const p = await page(createPgMock(base({ messages: msgs })), { limit: 1 });
    const wa = p.entries.find((e) => e.kind === 'whatsapp') as any;
    // no hay tope por entrada: la tarjeta llega con todo lo que quepa en MSG_FETCH
    expect(wa ? wa.count : 0).toBeLessThanOrEqual(50);
  });

  // ── R2.5 · recorrido de 3 páginas con empates, nulos y varias fuentes ──────
  test('R2.5 empates + NULLs + 4 fuentes: 3 páginas sin perder ni repetir', async () => {
    const activities = [
      act(10, T(20)), act(11, T(20)), act(12, T(20)),  // empate triple
      act(13, null), act(14, null),                     // dos NULL
      act(15, T(18)),
    ];
    const notes = [1, 2, 3].map((n) => ({
      id: uuid(50 + n), body: `n${n}`, user_id: null, created_at: T(19), is_pinned: false,
      organization_id: 1, related_type: 'opportunity', related_id: OPP,
    }));
    const tasks = [1, 2].map((n) => ({
      id: uuid(60 + n), title: `t${n}`, description: null, assigned_to: null, due_date: null,
      status: 'pending', priority: null, created_at: n === 1 ? null : T(17), completed_at: null,
      organization_id: 1, related_to_type: 'opportunity', related_to_id: OPP,
    }));
    const email_messages = [1, 2].map((n) => ({
      id: uuid(70 + n), subject: `s${n}`, to_email: 'a@b.c', from_email: null, status: 'sent',
      sent_at: T(16), created_at: T(16), open_count: 0, click_count: 0, body_html_snapshot: null,
      organization_id: 1, related_type: 'opportunity', related_id: OPP,
    }));
    const tables = base({ activities, notes, tasks, email_messages });
    const total = activities.length + notes.length + tasks.length + email_messages.length; // 13
    const seen: string[] = [];
    let cursor: string | null | undefined;
    let pages = 0;
    for (let i = 0; i < 12; i++) {
      const p = await page(createPgMock(tables, [], { unstableTies: i % 2 === 1 }), { limit: 5, cursor: cursor ?? undefined });
      pages++;
      seen.push(...p.entries.map((e) => e.id));
      cursor = p.next_cursor;
      if (!cursor) break;
    }
    expect(new Set(seen).size).toBe(seen.length);   // sin repetidos
    expect(new Set(seen).size).toBe(total);          // sin pérdidas
    expect(pages).toBeLessThanOrEqual(5);            // 13/5 → 3 páginas útiles
  });

  // ── R2.6 · fidelidad del simulador: `eq` sobre columna ausente ─────────────
  test('R2.6 pgMock: un filtro eq sobre una columna que el fixture no trae NO debe pasar', async () => {
    // En Postgres una fila sin `organization_id = 1` NUNCA casa. En el mock,
    // si la columna no está en el objeto del fixture, el filtro se da por bueno.
    const a = act(80, T(10));
    delete (a as Row).organization_id;
    delete (a as Row).related_id;
    delete (a as Row).related_type;
    const r = await page(createPgMock(base({ activities: [a] })), { limit: 10 });
    expect(r.entries.map((e) => e.id)).not.toContain(uuid(80));
  });

  // ── R2.7 · fidelidad del simulador: filtros que el mock ignora del todo ────
  test('R2.7 pgMock: `contains()` es un no-op y `select("...!inner")` no filtra', async () => {
    // `whatsappSource` usa `conversations!inner` + `eq('conversation.customer_id')`.
    // Un mensaje SIN el embed `conversation` debería quedar fuera (inner join),
    // pero el mock lo deja pasar porque `pick()` devuelve undefined.
    const msgs: Row[] = [{
      id: uuid(3000), organization_id: 1, conversation_id: 'convZ', channel_id: 'ch1',
      direction: 'inbound', role: 'customer', content: 'sin conversación', content_type: 'text',
      created_at: T(10), related_opportunity_id: null,
      // sin `conversation`: el !inner de Postgres lo descartaría
    }];
    const r = await page(createPgMock(base({ messages: msgs })), { limit: 10 });
    expect(r.entries.filter((e) => e.kind === 'whatsapp')).toHaveLength(0);
  });
});

// ── de builder r3 ────────────────────────────────────────────────────────────
describe('F9 · aislamiento multi-tenant del timeline (de builder r3, F9-40)', () => {
  test('B3.1 una activity de OTRA organización no entra en el timeline', async () => {
    const activities = [act(1, T(10)), act(2, T(9), { organization_id: 999 })];
    const r = await getTimeline(1, 'opportunity', OPP, createPgMock(base({ activities })), { limit: 30 });
    const ids = r.entries.map((e) => e.id);
    expect(ids).toContain(uuid(1));
    expect(ids).not.toContain(uuid(2));
  });

  test('B3.2 una oportunidad de OTRA organización no se puede abrir', async () => {
    const tables = base({});
    tables.opportunities = [{ id: OPP, customer_id: CUST, created_at: T(0), organization_id: 999 }];
    await expect(getTimeline(1, 'opportunity', OPP, createPgMock(tables), { limit: 10 }))
      .rejects.toBeInstanceOf(TimelineEntityNotFoundError);
  });
});

describe('F9 · precisión de timestamptz (de builder r3, F9-32)', () => {
  const A = '2026-09-08T10:00:00.123456+00:00';
  const B = '2026-09-08T10:00:00.123000+00:00';

  test('B3.4 canonicalTs normaliza a UTC con 6 dígitos y respeta el desfase', () => {
    expect(canonicalTs(A)).toBe('2026-09-08T10:00:00.123456Z');
    expect(canonicalTs('2026-09-08T05:00:00.000001-05:00')).toBe('2026-09-08T10:00:00.000001Z');
    expect(canonicalTs('2026-09-08T10:00:00Z')).toBe('2026-09-08T10:00:00.000000Z');
    expect(canonicalTs('no es una fecha')).toBe('1970-01-01T00:00:00.000000Z');
  });

  test('B3.5 dos filas del mismo milisegundo no son un empate y el cursor no las pierde', () => {
    // Orden: A (.123456) es MÁS RECIENTE que B (.123000)
    expect(compareDesc({ occurred_at: A, id: uuid(1) }, { occurred_at: B, id: uuid(2) })).toBeLessThan(0);
    // B es estrictamente anterior a A, así que la página siguiente debe traerla
    expect(isBefore({ occurred_at: B, id: uuid(2) }, { at: A, id: uuid(1) })).toBe(true);
    // …y el filtro SQL tiene que pedir el instante exacto, no el milisegundo
    expect(isoUtc(A)).toBe('2026-09-08T10:00:00.123456Z');
    expect(cursorFilter('occurred_at', { at: A, id: uuid(1) }))
      .toContain('occurred_at.lt.2026-09-08T10:00:00.123456Z');
  });
});

describe('F9 · cola segura y tope de WhatsApp (de builder r3, F9-30 / F9-34)', () => {
  const ctx = (limit: number, cursor: { at: string; id: string } | null = null) =>
    ({ limit, cursor, q: {} } as unknown as Ctx);
  const raw = (n: number, at: string, kind = 'activity'): Raw =>
    ({ kind: kind as Raw['kind'], id: uuid(n), occurred_at: at, user_id: null, row: {} });

  test('B3.6 finish: si el filtro en memoria deja la lista vacía, la cola sale de lo LEÍDO', () => {
    const rows = [raw(1, T(20)), raw(2, T(19)), raw(3, T(18))];
    const r = finish(rows, ctx(2), 3, () => false);
    expect(r.rows).toHaveLength(0);
    // `tail: null` significaría "fuente agotada" y cortaría la paginación (F9-30)
    expect(r.tail).not.toBeNull();
    expect(r.tail!.id).toBe(uuid(3));
  });

  test('B3.6b finish: sin filtro y con la fuente agotada, la cola es null', () => {
    const rows = [raw(1, T(20)), raw(2, T(19))];
    const r = finish(rows, ctx(5), 2);
    expect(r.rows).toHaveLength(2);
    expect(r.tail).toBeNull();
  });

  test('B3.7 una entrada de WhatsApp nunca lleva más de 50 mensajes', async () => {
    const msgs: Row[] = Array.from({ length: 120 }, (_, i) => ({
      id: uuid(3000 + i), organization_id: 1, conversation_id: 'convA', channel_id: 'ch1',
      direction: 'inbound', role: 'customer', content: `m${i}`, content_type: 'text',
      created_at: new Date(Date.UTC(2026, 8, 8, 12, 0, 0) - i * 1000).toISOString(),
      related_opportunity_id: OPP,
      conversation: { id: 'convA', customer_id: CUST, last_inbound_at: T(12) },
    }));
    const r = await getTimeline(1, 'opportunity', OPP, createPgMock(base({ messages: msgs })), { limit: 10 });
    const wa = r.entries.find((e) => e.kind === 'whatsapp') as any;
    expect(wa).toBeDefined();
    expect(wa.count).toBeLessThanOrEqual(50);
    // …y lo declara en vez de mentir con el conteo
    expect(wa.truncated).toBe(true);
  });
});
