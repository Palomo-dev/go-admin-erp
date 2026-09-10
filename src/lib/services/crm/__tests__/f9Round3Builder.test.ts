/**
 * F9 · ronda 3 (builder) — pruebas escritas ANTES de cada corrección y vistas
 * en rojo primero. Cubren lo que el informe TEST-F9-r2 dejó sin cobertura:
 *
 * - B3.1/B3.2 **aislamiento entre organizaciones** del timeline. El tester
 *   señaló (F9-40) que ningún test lo comprobaba, porque el simulador daba por
 *   buenas las columnas ausentes. Ahora `eq` es estricto y esto se puede probar.
 * - B3.3 el `pipelines!inner` de `changeStage` (F9-27) filtra de verdad.
 * - B3.4/B3.5 precisión de microsegundos en el orden y en el cursor (F9-32).
 * - B3.6 la cola segura sale de las filas leídas (F9-30).
 * - B3.7 tope de mensajes por entrada de WhatsApp (F9-34).
 * - B3.8 permisos de excepción de gate y de gestión de etapas (F9-36/F9-41).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getTimeline, TimelineEntityNotFoundError } from '../timelineService';
import { canonicalTs, compareDesc, isBefore, type Ctx, type Raw } from '../timeline/types';
import { cursorFilter, finish, isoUtc } from '../timeline/cursor';
import { changeStage } from '../opportunityStageService';
import { canManageStages, canOverrideStageGate } from '../stagePermissions';
import { createPgMock, type Row } from './pgMock';

jest.mock('@/lib/services/crm/stageGateService', () => ({ evaluateStageGate: jest.fn().mockResolvedValue({ ok: true, missing: [] }) }));

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

const act = (n: number, at: string | null, extra: Row = {}): Row => ({
  id: uuid(n), organization_id: 1, related_type: 'opportunity', related_id: OPP,
  activity_type: 'note', notes: 'x', user_id: null, occurred_at: at, metadata: {},
  channel: null, outcome: null, duration_seconds: null, call_id: null,
  email_message_id: null, message_id: null, conversation_id: null, ...extra,
});

describe('F9-r3 · aislamiento multi-tenant del timeline', () => {
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

  test('B3.3 changeStage: una etapa cuyo pipeline es de otra org devuelve stage_not_found', async () => {
    const opp = { id: OPP, organization_id: 1, pipeline_id: 'p1', stage_id: 's1', status: 'open', closed_at: null, updated_at: T(1), metadata: {} };
    const stageAjena = { id: 's2', name: 'De otra org', pipeline_id: 'p1', is_won: false, is_lost: false, pipelines: { id: 'p1', organization_id: 999 } };
    const sb = createPgMock({ opportunities: [opp], stages: [stageAjena] }) as SupabaseClient;
    const r = await changeStage(1, 'u1', { opportunityId: OPP, stageId: 's2' }, sb);
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toBe('stage_not_found');
  });

  test('B3.3b changeStage: la misma etapa con el pipeline de la org sí resuelve', async () => {
    const opp = { id: OPP, organization_id: 1, pipeline_id: 'p1', stage_id: 's1', status: 'open', closed_at: null, updated_at: T(1), metadata: {} };
    const stage = { id: 's2', name: 'Negociación', pipeline_id: 'p1', is_won: false, is_lost: false, pipelines: { id: 'p1', organization_id: 1 } };
    const sb = createPgMock({ opportunities: [opp], stages: [stage] }) as SupabaseClient;
    const r = await changeStage(1, 'u1', { opportunityId: OPP, stageId: 's2' }, sb);
    // El mock no aplica UPDATE, así que basta con comprobar que pasó del filtro
    expect((r as { reason?: string }).reason).not.toBe('stage_not_found');
  });
});

describe('F9-r3 · precisión de timestamptz (F9-32)', () => {
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

describe('F9-r3 · cola segura y tope de WhatsApp', () => {
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

describe('F9-r3 · permisos de etapa (F9-36 / F9-41)', () => {
  const ctx = (roleId: number, roleName: string, isSuperAdmin = false) => ({ roleId, roleName, isSuperAdmin });

  test('B3.8 Manager y administradores pueden saltarse el gate; Empleado y Cliente no', () => {
    expect(canOverrideStageGate(ctx(5, 'Manager'))).toBe(true);
    expect(canOverrideStageGate(ctx(2, 'Admin de organización'))).toBe(true);
    expect(canOverrideStageGate(ctx(1, 'Super Admin'))).toBe(true);
    expect(canOverrideStageGate(ctx(4, 'Empleado'))).toBe(false);
    expect(canOverrideStageGate(ctx(3, 'Cliente'))).toBe(false);
    // `is_super_admin` de organization_members manda por encima del rol
    expect(canOverrideStageGate(ctx(4, 'Empleado', true))).toBe(true);
  });

  test('B3.8b la gestión de etapas usa el mismo criterio', () => {
    expect(canManageStages(ctx(5, 'Manager'))).toBe(true);
    expect(canManageStages(ctx(4, 'Empleado'))).toBe(false);
  });
});
