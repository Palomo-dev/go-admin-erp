/// <reference types="jest" />
/**
 * F10 — contrato de `POST /api/crm/roi`: la fórmula nunca viene del cliente,
 * la calculadora se resuelve por (id, organización) y se evalúa sin Function.
 */
import { createFakeSupabase, type FakeDb } from '@/lib/services/crm/__tests__/f10FakeSupabase';

class FakeOrgContextError extends Error { statusCode = 401; code = 'UNAUTHORIZED'; }
let db: FakeDb;

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: FakeOrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: 120, userId: 'u-1', roleId: 2, roleName: 'x', isSuperAdmin: false, organizationName: 'Org', supabase: createFakeSupabase(db) })),
}));

import { NextRequest } from 'next/server';
import { POST } from '../route';

const post = (body: unknown) => POST(new NextRequest('http://localhost/api/crm/roi', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));

beforeEach(() => {
  db = {
    writes: [],
    rows: {
      roi_calculators: [
        { id: 'calc-1', organization_id: 120, name: 'Propia', formula: { operations: [{ output_key: 'savings', expression: 'inputs.a - inputs.b' }, { output_key: 'roi', expression: 'savings / inputs.b * 100' }] } },
        { id: 'calc-9', organization_id: 121, name: 'Ajena', formula: { operations: [{ output_key: 'leak', expression: '42' }] } },
        { id: 'calc-evil', organization_id: 120, name: 'Hostil', formula: { operations: [{ output_key: 'x', expression: 'constructor.constructor("return process")()' }] } },
      ],
    },
  };
});

describe('POST /api/crm/roi', () => {
  it('calculadora de la organización → outputs en cadena', async () => {
    const res = await post({ calculator_id: 'calc-1', inputs: { a: 1000, b: 400 } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.outputs).toEqual({ savings: 600, roi: 150 });
    expect(json.data.errors).toEqual({});
  });

  it('calculadora de otra organización → 404 (no se evalúa su fórmula)', async () => {
    const res = await post({ calculator_id: 'calc-9', inputs: { a: 1 } });
    expect(res.status).toBe(404);
  });

  it('una fórmula hostil guardada en la fila no se ejecuta: queda en errors', async () => {
    const res = await post({ calculator_id: 'calc-evil', inputs: {} });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.outputs).toEqual({});
    expect(json.data.errors.x).toBeTruthy();
  });

  it('fórmula u operaciones en el body → 400', async () => {
    expect((await post({ formula: { operations: [{ output_key: 'x', expression: '1' }] }, inputs: {} })).status).toBe(400);
    expect((await post({ template: 'otros', operations: [], inputs: {} })).status).toBe(400);
  });

  it('plantilla integrada por vertical → outputs; desconocida → 400', async () => {
    const res = await post({ template: 'otros', inputs: { current_cost: 1000, proposed_cost: 700, investment: 1200, annual_fee: 2400 } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.outputs.savings_monthly).toBe(300);
    expect(json.data.output_defs.length).toBe(5);
    expect((await post({ template: 'inexistente', inputs: {} })).status).toBe(400);
  });

  it('inputs no numéricos, claves raras o demasiados → 400; organización ajena en el body → 403', async () => {
    expect((await post({ template: 'otros', inputs: { current_cost: 'abc' } })).status).toBe(400);
    expect((await POST(new NextRequest('http://localhost/api/crm/roi', { method: 'POST', body: '{"template":"otros","inputs":{"__proto__":1}}', headers: { 'content-type': 'application/json' } }))).status).toBe(400);
    expect((await post({ template: 'otros', inputs: Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`k${i}`, 1])) })).status).toBe(400);
    expect((await post({ template: 'otros', inputs: {}, organization_id: 121 })).status).toBe(403);
  });
});
