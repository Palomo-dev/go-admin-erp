/// <reference types="jest" />
/**
 * F13 — deuda viva documentada (consolidado 2026-09-21 desde `f13Round3Tester`,
 * tester r3). Tres huecos reales que siguen abiertos; cada `it.failing` va con
 * su «evidencia» (el comportamiento de hoy, en verde). El día que el constructor
 * los cierre, jest avisará («passing test marked as failing»): se convierte el
 * `it.failing` en `it` y se borra o invierte su evidencia.
 *
 *  D1. POST cuota con `target_amount: true` responde 201 y crea una cuota de 1
 *      (`Number(true) === 1`); debería ser 400.
 *  D2. PATCH con `target_currency: null` sobre una cuota en EUR (base COP) es
 *      200 sin efecto (el UPDATE solo lleva `updated_at`); lo honesto es 400 o
 *      volver a la moneda base.
 *  D3. El motivo de reject/clawback no tiene tope en el servidor: la UI limita a
 *      `REASON_MAX` (ReasonDialog.tsx) pero 10 000 caracteres se guardan íntegros.
 */
import { createFakeSupabase, type FakeDb, type Row } from './f13FakeSupabase';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
let db: FakeDb;
const session = { roleId: 2, userId: 'u-admin', isSuperAdmin: false, organizationId: 120 };

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError,
  requireOrgAdmin: jest.fn(),
  getServerOrgContext: jest.fn(async () => ({ organizationId: session.organizationId, userId: session.userId, roleId: session.roleId, roleName: 'x', isSuperAdmin: session.isSuperAdmin, supabase: createFakeSupabase(db) })),
}));

import { NextRequest } from 'next/server';
import { validateQuotaPatch } from '../quotaProgress';
import { POST as rejectRoute } from '@/app/api/crm/commissions/[id]/reject/route';
import { POST as createTargetRoute } from '@/app/api/crm/sales-targets/route';
import { PATCH as patchTargetRoute } from '@/app/api/crm/sales-targets/[id]/route';

const C = (id: string, org: number, extra: Row = {}): Row => ({
  id, organization_id: org, branch_id: null, commission_type: 'salesperson', source_type: 'invoice_sale', source_id: `inv-${id}`, source_item_id: null,
  payee_type: 'employee', payee_id: 'u-1', payee_name: 'Ana', base_amount: 1000, commission_rate: 10, commission_amount: 100, currency: 'COP',
  status: 'accrued', accrued_at: '2026-09-05T15:00:00Z', paid_at: null, notes: null, metadata: null, created_by: null, created_at: '2026-09-05T15:00:00Z', updated_at: '2026-09-05T15:00:00Z', ...extra,
});
function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      organizations: [{ id: 120, timezone: 'America/Bogota' }],
      organization_currencies: [{ organization_id: 120, currency_code: 'COP', is_base: true }],
      organization_members: [{ id: 1, organization_id: 120, user_id: 'u-1', is_active: true }, { id: 2, organization_id: 120, user_id: 'u-admin', is_active: true }],
      profiles: [{ id: 'u-1', first_name: 'Ana', last_name: 'V', email: 'a@x' }],
      commissions: [C('c-1', 120)],
      sales_targets: [{ id: 't-1', organization_id: 120, user_id: 'u-1', period: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30', target_amount: 1000, target_currency: 'COP', target_type: 'revenue', achieved_amount: 0 }],
      opportunities: [], tasks: [], activities: [], calls: [], stages: [],
    },
  };
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const target = (id: string) => db.rows.sales_targets.find((t) => t.id === id)!;
const validQuota = { user_id: 'u-1', period: 'monthly', period_start: '2026-10-01', period_end: '2026-10-31', target_amount: 500 };
/** `REASON_MAX` vive en un .tsx (jest no lo transpila): se lee del fuente. */
const REASON_MAX = Number(/REASON_MAX = (\d+)/.exec(readFileSync(join(process.cwd(), 'src/components/finanzas/comisiones/ReasonDialog.tsx'), 'utf8'))?.[1] ?? 0);

beforeEach(() => {
  db = seed();
  session.roleId = 2; session.userId = 'u-admin'; session.isSuperAdmin = false; session.organizationId = 120;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('D1 — target_amount booleano (tester r3 R3T-2)', () => {
  it.failing('HUECO: POST cuota con target_amount: true debería ser 400 sin escribir', async () => {
    const res = await createTargetRoute(req('/x', 'POST', { ...validQuota, target_amount: true }));
    expect(res.status).toBe(400);
    expect(db.writes).toHaveLength(0);
  });
  it('evidencia: hoy `true` se guarda como target_amount = 1 (Number(true) === 1)', async () => {
    const res = await createTargetRoute(req('/x', 'POST', { ...validQuota, target_amount: true }));
    expect(res.status).toBe(201);
    expect(db.writes.find((w) => w.op === 'insert')!.row!.target_amount).toBe(1);
  });
});

describe('D2 — PATCH target_currency: null (tester r3 R3T-4)', () => {
  it.failing('HUECO: PATCH con target_currency: null sobre una cuota en EUR (base COP) debería ser 400 o volver a COP; nunca un 200 sin efecto', async () => {
    target('t-1').target_currency = 'EUR';
    const res = await patchTargetRoute(req('/x', 'PATCH', { target_currency: null }), params('t-1'));
    const json = await res.json();
    expect(res.status === 400 ? json.field === 'target_currency' : target('t-1').target_currency === 'COP').toBe(true);
  });
  it('evidencia: PATCH target_currency: null → 200, la cuota sigue en EUR y el UPDATE solo lleva updated_at', async () => {
    target('t-1').target_currency = 'EUR';
    const res = await patchTargetRoute(req('/x', 'PATCH', { target_currency: null }), params('t-1'));
    expect(res.status).toBe(200);
    expect(target('t-1').target_currency).toBe('EUR');
    expect(Object.keys(db.writes.filter((w) => w.op === 'update')[0].row!)).toEqual(['updated_at']);
  });
  it('evidencia (pura): validateQuotaPatch con target_currency: null devuelve un patch sin la clave efectiva', () => {
    const v = validateQuotaPatch({ target_currency: null }, { period: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30', target_amount: 1000, target_type: 'revenue', target_currency: 'COP' });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value).toEqual({ target_currency: undefined });
  });
});

describe('D3 — motivo sin tope en el servidor (tester r3 R3T-6)', () => {
  it.failing(`HUECO: el motivo de reject/clawback no tiene tope en el servidor (la UI limita a ${REASON_MAX}); 10 000 caracteres deberían ser 400`, async () => {
    const res = await rejectRoute(req('/x', 'POST', { reason: 'x'.repeat(10_000) }), params('c-1'));
    expect(res.status).toBe(400);
  });
  it('evidencia: hoy el motivo de 10 000 caracteres se guarda íntegro en notes', async () => {
    expect(REASON_MAX).toBeGreaterThan(0);
    const res = await rejectRoute(req('/x', 'POST', { reason: 'x'.repeat(10_000) }), params('c-1'));
    expect(res.status).toBe(200);
    expect(String(db.rows.commissions.find((r) => r.id === 'c-1')!.notes)).toHaveLength(10_000);
  });
});
