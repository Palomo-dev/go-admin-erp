/// <reference types="jest" />
/**
 * Rediseño UX de Secuencias (brief 6.3), ronda 2 — contrato del payload que
 * consumen `SequenceCard` (enrollment_stats) y `EnrollmentsSheet` (nombres).
 * `toEqual` sobre la forma exacta: si cambia un nombre de campo, esto muere.
 *
 * `@/lib/utils/orgContext` se dobla con fábrica (arrastra `svix`, solo ESM).
 * El cliente Supabase simulado sirve filas por tabla, APLICA los filtros
 * `eq`/`in` y resuelve al `await`: cada tabla lleva filas señuelo de otra
 * organización (121), así que leer con `ctx.organizationId + 1` —o sin
 * filtrar— cambia el payload y la prueba muere (tester r2 T8/T9, regla dura 5).
 */

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
// Extiende la clase real: `readOrgBody` (punto único) lanza la real y las rutas hacen `instanceof`.
class FakeOrgContextError extends RealOrgContextError {
  statusCode = 401;
  code = 'UNAUTHORIZED';
}

const ROWS: Record<string, unknown[]> = {
  sequences: [
    { id: 'seq-1', organization_id: 120, name: 'Seguimiento', trigger_type: 'manual', is_active: true, exit_conditions: ['won_lost'], stats: {} },
    { id: 'seq-9', organization_id: 121, name: 'Ajena', trigger_type: 'manual', is_active: true, exit_conditions: [], stats: {} },
  ],
  sequence_steps: [
    { id: 'st-1', sequence_id: 'seq-1', organization_id: 120, step_number: 1, channel: 'email', delay_days: 0, delay_hours: 0 },
    { id: 'st-9', sequence_id: 'seq-9', organization_id: 121, step_number: 1, channel: 'sms', delay_days: 0, delay_hours: 0 },
  ],
  sequence_enrollments: [
    { id: 'e1', sequence_id: 'seq-1', organization_id: 120, status: 'active', paused_reason: null, exit_reason: null, opportunity_id: 'o1', customer_id: null, enrolled_at: '2026-09-01T00:00:00Z' },
    { id: 'e2', sequence_id: 'seq-1', organization_id: 120, status: 'paused', paused_reason: 'customer_replied_whatsapp', exit_reason: null, opportunity_id: null, customer_id: 'c2', enrolled_at: '2026-09-02T00:00:00Z' },
    // Señuelos: misma secuencia y mismo id de oportunidad/cliente, otra organización.
    { id: 'e9', sequence_id: 'seq-1', organization_id: 121, status: 'active', paused_reason: null, exit_reason: null, opportunity_id: 'o1', customer_id: null, enrolled_at: '2026-09-03T00:00:00Z' },
  ],
  opportunities: [
    { id: 'o1', organization_id: 120, name: 'Alfa', customer_id: 'c1' },
    { id: 'o1', organization_id: 121, name: 'Ajena', customer_id: 'c9' },
  ],
  customers: [
    { id: 'c1', organization_id: 120, full_name: 'Ana' },
    { id: 'c2', organization_id: 120, full_name: 'Bea' },
    { id: 'c1', organization_id: 121, full_name: 'Ajena' },
    { id: 'c2', organization_id: 121, full_name: 'Ajena' },
  ],
};

type Row = Record<string, unknown>;

function fakeSupabase() {
  const from = (table: string) => {
    const filters: ((row: Row) => boolean)[] = [];
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'range', 'limit']) chain[m] = () => chain;
    chain.eq = (col: string, value: unknown) => { filters.push((r) => r[col] === value); return chain; };
    chain.in = (col: string, values: unknown[]) => { filters.push((r) => values.includes(r[col])); return chain; };
    chain.then = (resolve: (v: unknown) => void) => {
      const data = ((ROWS[table] ?? []) as Row[]).filter((r) => filters.every((f) => f(r)));
      resolve({ data, error: null, count: data.length });
    };
    return chain;
  };
  return { from };
}

jest.mock('@/lib/services/crm/emailService', () => ({ sendEmail: jest.fn() }));

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError, // la clase real: `readOrgBody` lanza la real y las rutas hacen `instanceof`
  requireOrgAdmin: jest.fn(),
  getServerOrgContext: jest.fn(async () => ({ organizationId: 120, userId: 'u-1', supabase: fakeSupabase() })),
}));

import { NextRequest } from 'next/server';
import { GET as getList } from '../route';
import { GET as getEnrollments } from '../[id]/enrollments/route';

describe('GET /api/crm/sequences — contrato de enrollment_stats', () => {
  it('cada secuencia lleva enrollment_stats con la forma exacta', async () => {
    const res = await getList();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1); // la de la org 121 no aparece
    expect(json.data[0].id).toBe('seq-1');
    expect(json.data[0].steps).toEqual([expect.objectContaining({ id: 'st-1', step_number: 1 })]);
    expect(json.data[0].enrollment_stats).toEqual({ active: 2, total: 2, replied: 1, response_rate: 0.5 });
  });

  it('las estadísticas y los pasos no cuentan filas de otra organización aunque compartan sequence_id', async () => {
    const json = await (await getList()).json();
    // Con el señuelo e9 (org 121) contado, saldría active: 3 / total: 3.
    expect(json.data[0].enrollment_stats.total).toBe(2);
    expect(json.data[0].steps).toHaveLength(1);
  });
});

describe('GET /api/crm/sequences/[id]/enrollments — contrato de nombres', () => {
  it('resuelve opportunity_name y customer_name (por oportunidad o por cliente directo)', async () => {
    const req = new NextRequest('http://localhost/api/crm/sequences/seq-1/enrollments');
    const res = await getEnrollments(req, { params: Promise.resolve({ id: 'seq-1' }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({
      success: true,
      count: 2,
      data: [
        { ...ROWS.sequence_enrollments[0] as object, opportunity_name: 'Alfa', customer_name: 'Ana' },
        { ...ROWS.sequence_enrollments[1] as object, opportunity_name: null, customer_name: 'Bea' },
      ],
    });
    // Ni la inscripción e9 ni los nombres «Ajena» (mismos ids en la org 121) se cuelan.
    expect(JSON.stringify(json)).not.toContain('Ajena');
  });
});
