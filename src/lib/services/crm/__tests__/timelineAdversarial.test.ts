/**
 * Pruebas adversarias del timeline v2 (F9).
 *
 * ORIGEN: las escribió el TESTER en la ronda 1 (`TEST-F9-r1.md`) como
 * reproducción de 10 defectos; en aquel momento cada `expect` afirmaba el
 * comportamiento ROTO (p. ej. "la página 2 repite la página 1").
 *
 * RONDA 2 (builder): los defectos están corregidos, así que los asserts se han
 * **invertido para afirmar el comportamiento correcto**, conservando intactos
 * el escenario, el mock fiel y el número de test. No se ha debilitado ninguno:
 * cada caso comprueba ahora lo contrario de lo que reproducía, y varios añaden
 * comprobaciones extra (sin duplicados, la fila llega a salir, etc.).
 * Un test que siguiera exigiendo el bug sería un test incorrecto: afirmaría
 * que el timeline pierde datos.
 *
 * El mock vive en `./pgMock.ts` y emula: `lte/gte` sobre NULL excluyen la fila,
 * NULLS FIRST por defecto en DESC (salvo `nullsFirst:false`), `or()` con
 * `and()` anidado, y empates rotos de forma arbitraria (`unstableTies`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getTimeline } from '../timelineService';
import { createPgMock, type Row } from './pgMock';

/* eslint-disable @typescript-eslint/no-explicit-any */

const T = (h: number, m = 0, s = 0) => new Date(Date.UTC(2026, 8, 8, h, m, s)).toISOString();
const OPP = '11111111-1111-4111-8111-111111111111';
const OPP2 = '11111111-1111-4111-8111-111111111112';
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

function decode(cursor: string): string {
  return Buffer.from(cursor.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

describe('F9 — timeline v2 (casos adversarios del tester, corregidos en ronda 2)', () => {
  test('T1.1 created_at NULL en notes: el cursor es válido y la página 2 NO repite la página 1', async () => {
    const notes = [
      { id: uuid(31), body: 'b', user_id: null, created_at: null, is_pinned: false, organization_id: 1, related_type: 'opportunity', related_id: OPP },
      { id: uuid(32), body: 'c', user_id: null, created_at: null, is_pinned: false, organization_id: 1, related_type: 'opportunity', related_id: OPP },
    ];
    const p1 = await page(createPgMock(base({ notes })), { limit: 1 });
    expect(p1.entries).toHaveLength(1);
    expect(p1.next_cursor).not.toBeNull();
    // El timestamp NULL se representa como epoch, nunca como la cadena "null"
    expect(decode(p1.next_cursor!).startsWith('null|')).toBe(false);
    expect(decode(p1.next_cursor!).startsWith('1970-01-01')).toBe(true);

    const p2 = await page(createPgMock(base({ notes })), { limit: 1, cursor: p1.next_cursor! });
    expect(p2.entries).toHaveLength(1);
    expect(p2.entries[0].id).not.toBe(p1.entries[0].id);
    // Entre las dos páginas salen las DOS notas, sin repetir ninguna
    expect(new Set([p1.entries[0].id, p2.entries[0].id]).size).toBe(2);
  });

  test('T1.2 empates de occurred_at: el desempate por id en SQL hace la página determinista', async () => {
    // 5 notas con el MISMO created_at; el servicio pide limit+1 = 3. Con
    // `.order('id')` el subconjunto ya no depende del plan de Postgres.
    const notes = [1, 2, 3, 4, 5].map((n) => ({
      id: uuid(40 + n), body: `n${n}`, user_id: null, created_at: T(10), is_pinned: false,
      organization_id: 1, related_type: 'opportunity', related_id: OPP,
    }));
    const stable = await page(createPgMock(base({ notes })), { limit: 2 });
    const unstable = await page(createPgMock(base({ notes }), [], { unstableTies: true }), { limit: 2 });
    expect(stable.entries.map((e) => e.id)).toEqual(unstable.entries.map((e) => e.id));
    // y es el desempate esperado: ids más altos primero
    expect(stable.entries.map((e) => e.id)).toEqual([uuid(45), uuid(44)]);
  });

  test('T1.3 sin truncado silencioso: se pagina hasta agotar la BD y next_cursor no miente', async () => {
    const callId = uuid(100);
    const act = (n: number, at: string, extra: Row = {}) => ({
      id: uuid(n), organization_id: 1, related_type: 'opportunity', related_id: OPP,
      activity_type: 'note', notes: 'x', user_id: null, occurred_at: at, metadata: {},
      channel: null, outcome: null, duration_seconds: null, call_id: null, ...extra,
    });
    const tables = base({
      calls: [{ id: callId, organization_id: 1, opportunity_id: OPP, direction: 'outbound', status: 'completed', mode: 'browser', duration_seconds: 60, started_at: T(21), user_id: null, recording_enabled: false, call_recordings: [], call_transcripts: [], call_analyses: [] }],
      activities: [act(1, T(20)), act(2, T(19)), act(3, T(18)), act(4, T(5), { activity_type: 'call', call_id: callId })],
    });
    const p1 = await page(createPgMock(tables), { limit: 2 });
    const seen: string[] = p1.entries.map((e) => e.id);
    let cursor = p1.next_cursor;
    for (let i = 0; i < 6 && cursor; i++) {
      const p = await page(createPgMock(tables), { limit: 2, cursor });
      seen.push(...p.entries.map((e) => e.id));
      cursor = p.next_cursor;
    }
    // Las 4 activities + la llamada salen todas, una sola vez cada una
    expect(seen).toContain(uuid(4));
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  test('T1.4 el grupo de WhatsApp no se duplica entre páginas', async () => {
    const msgs = [0, 1, 2].map((i) => ({
      id: uuid(400 + i), organization_id: 1, conversation_id: 'conv1', channel_id: 'ch1',
      direction: 'inbound', role: 'customer', content: `m${i}`, content_type: 'text',
      created_at: T(10, 0, 30 - i * 10), related_opportunity_id: OPP,
      conversation: { id: 'conv1', customer_id: CUST, last_inbound_at: T(10) },
    }));
    const tables = base({ messages: msgs, notes: [{ id: uuid(60), body: 'x', user_id: null, created_at: T(9), is_pinned: false, organization_id: 1, related_type: 'opportunity', related_id: OPP }] });
    const p1 = await page(createPgMock(tables), { limit: 1 });
    expect(p1.entries[0].kind).toBe('whatsapp');
    const first = p1.entries[0] as unknown as { count: number };
    expect(first.count).toBe(3); // el grupo llega completo en una sola tarjeta
    const p2 = await page(createPgMock(tables), { limit: 5, cursor: p1.next_cursor! });
    expect(p2.entries.filter((e) => e.kind === 'whatsapp')).toHaveLength(0);
    // y la página 2 sí trae lo que quedaba por debajo del grupo
    expect(p2.entries.map((e) => e.id)).toContain(uuid(60));
  });

  test('T1.5 filtro `kinds`: no se pierde ninguna entrada entre páginas', async () => {
    // 30 activities 'call' recientes llenan la ventana de la fuente `activities`;
    // una activity 'note' intermedia queda por debajo y NO se puede saltar.
    const activities = [
      ...Array.from({ length: 30 }, (_, i) => ({
        id: uuid(500 + i), organization_id: 1, related_type: 'opportunity', related_id: OPP,
        activity_type: 'call', notes: 'c', user_id: null, occurred_at: T(20, 0, 59 - i), metadata: {},
        call_id: null, channel: 'phone', outcome: null, duration_seconds: 1,
      })),
      { id: uuid(600), organization_id: 1, related_type: 'opportunity', related_id: OPP, activity_type: 'note', notes: 'INTERMEDIA', user_id: null, occurred_at: T(12), metadata: {}, call_id: null, channel: null, outcome: null, duration_seconds: null },
    ];
    const notes = [1, 2].map((n) => ({ id: uuid(70 + n), body: `n${n}`, user_id: null, created_at: T(5, n), is_pinned: false, organization_id: 1, related_type: 'opportunity', related_id: OPP }));
    const tables = base({ activities, notes });
    const p1 = await page(createPgMock(tables), { limit: 10, kinds: ['note'] });
    const seen = p1.entries.map((e) => e.id);
    let cursor = p1.next_cursor;
    for (let i = 0; i < 5 && cursor; i++) {
      const p = await page(createPgMock(tables), { limit: 10, kinds: ['note'], cursor });
      seen.push(...p.entries.map((e) => e.id));
      cursor = p.next_cursor;
    }
    expect(seen).toContain(uuid(600));
    expect(seen).toContain(uuid(71));
    expect(seen).toContain(uuid(72));
    expect(new Set(seen).size).toBe(seen.length);
  });

  test('T1.6 filtro `channels` filtra por activities.channel', async () => {
    const activities = [
      { id: uuid(80), organization_id: 1, related_type: 'opportunity', related_id: OPP, activity_type: 'visit', notes: 'visita', user_id: null, occurred_at: T(12), metadata: {}, channel: 'in_person', outcome: null, duration_seconds: null, call_id: null },
      { id: uuid(81), organization_id: 1, related_type: 'opportunity', related_id: OPP, activity_type: 'visit', notes: 'reg. email', user_id: null, occurred_at: T(11), metadata: {}, channel: 'email', outcome: null, duration_seconds: null, call_id: null },
    ];
    const r = await page(createPgMock(base({ activities })), { channels: ['email'] });
    // La visita presencial ya no aparece; la registrada como canal email sí
    expect(r.entries.map((e) => e.id)).toEqual([uuid(81)]);
  });

  test('T1.7 voice_agent_calls: se pagina por la misma columna que se muestra', async () => {
    // Llamada IA creada HOY (created_at 20:00) pero iniciada a las 03:00.
    const vac = [
      { id: uuid(90), organization_id: 1, opportunity_id: OPP, call_id: null, status: 'completed', outcome: 'ok', duration_seconds: 30, turns_count: 2, conversation_log: null, created_at: T(20), scheduled_at: T(20), started_at: T(3), voice_agents: [] },
    ];
    const notes = [1, 2, 3].map((n) => ({ id: uuid(94 + n), body: `n${n}`, user_id: null, created_at: T(12 + n), is_pinned: false, organization_id: 1, related_type: 'opportunity', related_id: OPP }));
    const tables = base({ voice_agent_calls: vac, notes });
    const seen: string[] = [];
    let cursor: string | null | undefined;
    for (let i = 0; i < 5; i++) {
      const p = await page(createPgMock(tables), { limit: 2, cursor: cursor ?? undefined });
      seen.push(...p.entries.map((e) => e.id));
      cursor = p.next_cursor;
      if (!cursor) break;
    }
    expect(seen).toContain(uuid(90));
    expect(new Set(seen).size).toBe(seen.length);
  });

  test('T1.8 el timeline de una oportunidad NO incluye WhatsApp de otra oportunidad del mismo cliente', async () => {
    const msgs = [{
      id: uuid(410), organization_id: 1, conversation_id: 'conv9', channel_id: 'ch1',
      direction: 'inbound', role: 'customer', content: 'de la otra oportunidad', content_type: 'text',
      created_at: T(11), related_opportunity_id: OPP2,
      conversation: { id: 'conv9', customer_id: CUST, last_inbound_at: T(11) },
    }];
    const r = await page(createPgMock(base({ messages: msgs })));
    expect(r.entries.filter((e) => e.kind === 'whatsapp')).toHaveLength(0);
  });

  test('T1.9 número de consultas por página (round-trips a Postgres)', async () => {
    const log: string[] = [];
    const sb = createPgMock(base({
      activities: [{ id: uuid(1), organization_id: 1, related_type: 'opportunity', related_id: OPP, activity_type: 'call', notes: 'x', user_id: 'u1', occurred_at: T(10), metadata: {}, call_id: uuid(100), channel: 'phone', outcome: null, duration_seconds: 1 }],
    }), log);
    await page(sb);
    // F9-44 (ronda 3): esto era una banda de tolerancia (10..20) que dejaba de
    // reportar la desviación. Ahora la cifra está FIJADA: hoy son 12 consultas
    // por página sin cursor —1 `loadEntity` + 9 de fuentes (whatsapp hace 2) +
    // 2 de hidratación— y F9-20 (bajarlas con una RPC) sigue ABIERTO. Si el
    // número cambia, este test falla y hay que explicar por qué, en vez de que
    // la deuda crezca en silencio dentro de una banda.
    expect(log).toEqual([
      'opportunities',
      'activities', 'tasks', 'notes', 'calls', 'email_messages', 'messages', 'messages',
      'voice_agent_calls', 'opportunity_stage_history',
      'profiles', 'calls',
    ]);
    expect(log.length).toBe(12);
  });

  test('T1.10 occurred_at NULL en activities: sobrevive al cursor y queda fuera del rango de fechas', async () => {
    const activities = [
      { id: uuid(11), organization_id: 1, related_type: 'opportunity', related_id: OPP, activity_type: 'note', notes: 'sin fecha', user_id: null, occurred_at: null, metadata: {}, channel: null, outcome: null, duration_seconds: null, call_id: null },
      { id: uuid(12), organization_id: 1, related_type: 'opportunity', related_id: OPP, activity_type: 'note', notes: 'con fecha', user_id: null, occurred_at: T(10), metadata: {}, channel: null, outcome: null, duration_seconds: null, call_id: null },
    ];
    const sinCursor = await page(createPgMock(base({ activities })), { limit: 10 });
    expect(sinCursor.entries.map((e) => e.id)).toContain(uuid(11));
    // Un NULL vale epoch (1970): fuera de un rango de 2026, correctamente.
    const conRango = await page(createPgMock(base({ activities })), { limit: 10, from: T(0), to: T(23) });
    expect(conRango.entries.map((e) => e.id)).not.toContain(uuid(11));
    // Pero paginando SÍ se llega a él (antes desaparecía en cuanto había cursor)
    const p1 = await page(createPgMock(base({ activities })), { limit: 1 });
    expect(p1.entries.map((e) => e.id)).toEqual([uuid(12)]);
    const p2 = await page(createPgMock(base({ activities })), { limit: 1, cursor: p1.next_cursor! });
    expect(p2.entries.map((e) => e.id)).toEqual([uuid(11)]);
  });
});
