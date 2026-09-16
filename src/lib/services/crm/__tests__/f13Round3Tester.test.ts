/// <reference types="jest" />
/**
 * F13 — ronda 3, pruebas del TESTER sobre los bordes que las rondas 1 y 2 no
 * cubrían: carreras clawback/clawback y pay/reject sobre la misma fila,
 * clawback sobre una ya revertida, montos negativos o basura en cuotas y en
 * el resumen, cuota sin periodo (POST y PATCH), moneda nula/vacía/con espacios,
 * `organization_id` ajeno en el QUERY de las lecturas, lotes malformados y el
 * tope de longitud del motivo (`REASON_MAX`) que la UI impone y el servidor no.
 *
 * Los `it.failing` son huecos reales: el día que el constructor los cierre,
 * jest avisará («passing test marked as failing») y se convierten en `it`.
 * Datos sintéticos: organizaciones 120/121 y usuarios u-*; nada de clientes.
 */

import { createFakeSupabase, type FakeDb, type Row } from './f13FakeSupabase';

class FakeOrgContextError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode = 401, code = 'UNAUTHORIZED') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

let db: FakeDb;
const session = { roleId: 2, userId: 'u-admin', isSuperAdmin: false, organizationId: 120 };

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: FakeOrgContextError,
  requireOrgAdmin: jest.fn(),
  getServerOrgContext: jest.fn(async () => ({
    organizationId: session.organizationId,
    userId: session.userId,
    roleId: session.roleId,
    roleName: 'x',
    isSuperAdmin: session.isSuperAdmin,
    supabase: createFakeSupabase(db),
  })),
}));

import { NextRequest } from 'next/server';
import { clawbackCommission, payCommission, rejectCommission } from '../commissionAdminService';
import { CommissionTransitionError, summarizeCommissionsByCurrency } from '../commissionTransitions';
import { validateQuotaInput, validateQuotaPatch } from '../quotaProgress';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GET as listRoute } from '@/app/api/crm/commissions/route';
import { POST as clawbackRoute } from '@/app/api/crm/commissions/[id]/clawback/route';
import { POST as rejectRoute } from '@/app/api/crm/commissions/[id]/reject/route';
import { POST as bulkPayRoute } from '@/app/api/crm/commissions/bulk-pay/route';
import { GET as listTargetsRoute, POST as createTargetRoute } from '@/app/api/crm/sales-targets/route';
import { PATCH as patchTargetRoute } from '@/app/api/crm/sales-targets/[id]/route';
import { GET as dashboardGet } from '@/app/api/crm/seller-dashboard/route';
// La ruta no lee la petición (ni query ni body): la firma real es GET(). El doble
// acepta la petición para dejar constancia de que el `organization_id` de la query
// se ignora por construcción.
const dashboardRoute = (_req: Request) => dashboardGet();

const C = (id: string, org: number, extra: Row = {}): Row => ({
  id, organization_id: org, branch_id: null, commission_type: 'salesperson', source_type: 'invoice_sale', source_id: `inv-${id}`, source_item_id: null,
  payee_type: 'employee', payee_id: 'u-1', payee_name: 'Ana', base_amount: 1000, commission_rate: 10, commission_amount: 100, currency: 'COP',
  status: 'accrued', accrued_at: '2026-09-05T15:00:00Z', paid_at: null, notes: null, metadata: null, created_by: null, created_at: '2026-09-05T15:00:00Z', updated_at: '2026-09-05T15:00:00Z', ...extra,
});

function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      organizations: [{ id: 120, timezone: 'America/Bogota' }, { id: 121, timezone: 'UTC' }],
      organization_currencies: [{ organization_id: 120, currency_code: 'COP', is_base: true }, { organization_id: 121, currency_code: 'USD', is_base: true }],
      organization_members: [
        { id: 1, organization_id: 120, user_id: 'u-1', is_active: true },
        { id: 2, organization_id: 120, user_id: 'u-admin', is_active: true },
        { id: 3, organization_id: 121, user_id: 'u-ajeno', is_active: true },
      ],
      profiles: [{ id: 'u-1', first_name: 'Ana', last_name: 'V', email: 'a@x' }, { id: 'u-admin', first_name: 'Admin', last_name: '', email: 'ad@x' }],
      commissions: [
        C('c-1', 120),
        C('c-2', 120, { status: 'paid', paid_at: '2026-09-06T10:00:00Z', metadata: { origen: 'factura' } }),
        C('c-neg', 120, { commission_amount: -40 }),
        C('c-9', 121),
        C('c-9p', 121, { status: 'paid', paid_at: '2026-09-06T10:00:00Z' }),
      ],
      sales_targets: [
        { id: 't-1', organization_id: 120, user_id: 'u-1', period: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30', target_amount: 1000, target_currency: 'COP', target_type: 'revenue', achieved_amount: 0 },
        { id: 't-9', organization_id: 121, user_id: 'u-ajeno', period: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30', target_amount: 5, target_currency: 'USD', target_type: 'revenue', achieved_amount: 0 },
      ],
      opportunities: [], tasks: [], activities: [], calls: [], stages: [],
    },
  };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const supa = () => createFakeSupabase(db) as unknown as import('@supabase/supabase-js').SupabaseClient;
const row = (id: string) => db.rows.commissions.find((r) => r.id === id)!;
const updates = () => db.writes.filter((w) => w.op === 'update');
/** `REASON_MAX` vive en un .tsx (jest no lo transpila): se lee del fuente. */
const REASON_MAX = Number(/REASON_MAX = (\d+)/.exec(readFileSync(join(process.cwd(), 'src/components/finanzas/comisiones/ReasonDialog.tsx'), 'utf8'))?.[1] ?? 0);
const validQuota = { user_id: 'u-1', period: 'monthly', period_start: '2026-10-01', period_end: '2026-10-31', target_amount: 500 };

beforeEach(() => {
  db = seed();
  session.roleId = 2; session.userId = 'u-admin'; session.isSuperAdmin = false; session.organizationId = 120;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('R3T-1 — carreras sobre la misma comisión', () => {
  it('dos clawback a la vez sobre la misma pagada: exactamente uno revierte, el otro 409; ambos exigieron status=paid', async () => {
    const results = await Promise.allSettled([
      clawbackCommission('c-2', 120, 'devolución', supa(), 'u-admin'),
      clawbackCommission('c-2', 120, 'devolución', supa(), 'u-admin'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const ko = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ko).toHaveLength(1);
    expect((ko[0].reason as CommissionTransitionError).statusCode).toBe(409);
    expect(updates()).toHaveLength(2);
    for (const u of updates()) expect(u.filters).toMatchObject({ id: 'c-2', organization_id: 120, status: 'paid' });
    const r = row('c-2');
    expect(r.status).toBe('cancelled');
    expect(r.paid_at).toBe('2026-09-06T10:00:00Z');
    expect(r.metadata).toMatchObject({ origen: 'factura', reason: 'clawback', clawback_of_paid: true, paid_at_before_clawback: '2026-09-06T10:00:00Z' });
  });

  it('pay y reject a la vez sobre la misma accrued: solo uno gana y la fila queda en UN estado coherente (paid sin metadata de rechazo, o cancelled sin paid_at)', async () => {
    const results = await Promise.allSettled([payCommission('c-1', 120, supa(), 'u-admin'), rejectCommission('c-1', 120, 'no procede', supa(), 'u-admin')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const r = row('c-1');
    if (r.status === 'paid') {
      expect(r.paid_at).toBeTruthy();
      expect((r.metadata as Record<string, unknown> | null)?.reason).toBeUndefined();
    } else {
      expect(r.status).toBe('cancelled');
      expect(r.paid_at).toBeNull();
      expect(r.metadata).toMatchObject({ reason: 'rejected' });
    }
  });

  it('clawback sobre una ya revertida (cancelled) → 409 por la ruta, sin segunda escritura; y sobre una pagada de otra org → 404', async () => {
    const first = await clawbackRoute(req('/x', 'POST', { reason: 'devolución' }), params('c-2'));
    expect(first.status).toBe(200);
    const second = await clawbackRoute(req('/x', 'POST', { reason: 'otra vez' }), params('c-2'));
    expect(second.status).toBe(409);
    expect((await second.json()).code).toBe('INVALID_TRANSITION');
    expect(updates()).toHaveLength(1);
    expect(row('c-2').notes).toBe('devolución');
    const foreign = await clawbackRoute(req('/x', 'POST', { reason: 'x' }), params('c-9p'));
    expect(foreign.status).toBe(404);
    expect(updates()).toHaveLength(1);
  });
});

describe('R3T-2 — montos negativos y basura', () => {
  const bad: Array<[string, unknown]> = [
    ['negativo', -1], ['cero', 0], ['texto', 'abc'], ['negativo como texto', '-5'], ['Infinity', '1e400'],
    ['null', null], ['array', []], ['objeto', {}], ['NaN', 'NaN'],
  ];
  it.each(bad)('POST cuota con target_amount %s → 400 con field target_amount y sin escribir', async (_label, amount) => {
    const res = await createTargetRoute(req('/x', 'POST', { ...validQuota, target_amount: amount }));
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('target_amount');
    expect(db.writes).toHaveLength(0);
  });

  it.failing('HUECO: POST cuota con target_amount: true responde 201 y crea una cuota de 1 (Number(true) === 1); debería ser 400', async () => {
    const res = await createTargetRoute(req('/x', 'POST', { ...validQuota, target_amount: true }));
    expect(res.status).toBe(400);
    expect(db.writes).toHaveLength(0);
  });

  it('evidencia del hueco anterior: hoy `true` se guarda como target_amount = 1', async () => {
    const res = await createTargetRoute(req('/x', 'POST', { ...validQuota, target_amount: true }));
    expect(res.status).toBe(201);
    expect(db.writes.find((w) => w.op === 'insert')!.row!.target_amount).toBe(1);
  });

  it('PATCH cuota con target_amount negativo → 400 y la fila no cambia', async () => {
    const res = await patchTargetRoute(req('/x', 'PATCH', { target_amount: -100 }), params('t-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('target_amount');
    expect(db.writes).toHaveLength(0);
    expect(db.rows.sales_targets.find((t) => t.id === 't-1')!.target_amount).toBe(1000);
  });

  it('conteos: deals con 2.5 → 400 (entero); revenue con 2.5 → ok', () => {
    expect(validateQuotaInput({ ...validQuota, target_type: 'deals', target_amount: 2.5 })).toMatchObject({ ok: false, field: 'target_amount' });
    expect(validateQuotaInput({ ...validQuota, target_type: 'revenue', target_amount: 2.5 })).toMatchObject({ ok: true });
  });

  it('resumen: una comisión con importe negativo (la BD no lo prohíbe: sin CHECK) resta del pendiente y del devengado en vez de desaparecer', async () => {
    // Hoy hay 0 negativas en producción, pero `commissions.commission_amount` es numeric sin CHECK >= 0.
    const json = await (await listRoute(req('/api/crm/commissions', 'GET'))).json();
    expect(json.summary).toMatchObject({ currency: 'COP', count: 3, pending_total: 60, paid_total: 100, accrued_total: 160, count_pending: 2 });
  });

  it('resumen: importes como texto («1e3», «abc», null) no rompen: numérico se suma, basura cuenta como 0', () => {
    const s = summarizeCommissionsByCurrency(
      [
        { status: 'accrued', commission_amount: '1e3', currency: 'COP' },
        { status: 'accrued', commission_amount: 'abc', currency: 'COP' },
        { status: 'paid', commission_amount: null, currency: 'COP' },
      ],
      'COP'
    );
    expect(s.primary).toMatchObject({ pending_total: 1000, paid_total: 0, accrued_total: 1000, count: 3 });
  });
});

describe('R3T-3 — cuota sin periodo', () => {
  it.each([['ausente', undefined], ['null', null], ['vacío', ''], ['mayúsculas', 'MONTHLY'], ['semanal', 'weekly'], ['número', 1]])(
    'POST con period %s → 400 field period, sin escribir',
    async (_label, period) => {
      const body: Record<string, unknown> = { ...validQuota };
      if (period === undefined) delete body.period; else body.period = period;
      const res = await createTargetRoute(req('/x', 'POST', body));
      expect(res.status).toBe(400);
      expect((await res.json()).field).toBe('period');
      expect(db.writes).toHaveLength(0);
    }
  );

  it('PATCH sin nada actualizable ({} / solo achieved_amount / solo organization_id propio) → 400 field body, nunca 200 fingido', async () => {
    for (const body of [{}, { achieved_amount: 999 }, { organization_id: 120 }]) {
      const res = await patchTargetRoute(req('/x', 'PATCH', body), params('t-1'));
      expect(res.status).toBe(400);
      expect((await res.json()).field).toBe('body');
    }
    expect(db.writes).toHaveLength(0);
    expect(db.rows.sales_targets.find((t) => t.id === 't-1')!.achieved_amount).toBe(0);
  });

  it('PATCH con period: null → 400 field period (no se cuela como «sin cambio»)', async () => {
    const res = await patchTargetRoute(req('/x', 'PATCH', { period: null }), params('t-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('period');
  });

  it('el periodo vacío no se salva por límites correctos: monthly con límites de un trimestre → period_end', () => {
    const v = validateQuotaInput({ ...validQuota, period: 'monthly', period_start: '2026-10-01', period_end: '2026-12-31' });
    expect(v).toMatchObject({ ok: false, field: 'period_end' });
  });
});

describe('R3T-4 — moneda null, vacía o sucia', () => {
  it.each([['null', null], ['vacía', ''], ['espacios', '   ']])('POST con target_currency %s → se usa la base de la org (121 = USD), no «null» ni el default USD de la columna', async (_l, cur) => {
    session.organizationId = 121;
    db.rows.organization_members.push({ id: 4, organization_id: 121, user_id: 'u-1', is_active: true });
    const res = await createTargetRoute(req('/x', 'POST', { ...validQuota, target_currency: cur }));
    expect(res.status).toBe(201);
    expect(db.writes.find((w) => w.op === 'insert')!.row!.target_currency).toBe('USD');
  });

  it('POST con target_currency « usd » → USD normalizada; «US», «USDX», 123, «€» → 400 field target_currency', async () => {
    const ok = await createTargetRoute(req('/x', 'POST', { ...validQuota, target_currency: ' usd ' }));
    expect(ok.status).toBe(201);
    expect(db.writes.find((w) => w.op === 'insert')!.row!.target_currency).toBe('USD');
    for (const cur of ['US', 'USDX', 123, '€']) {
      const res = await createTargetRoute(req('/x', 'POST', { ...validQuota, target_currency: cur }));
      expect(res.status).toBe(400);
      expect((await res.json()).field).toBe('target_currency');
    }
    expect(db.writes.filter((w) => w.op === 'insert')).toHaveLength(1);
  });

  it.failing('HUECO: PATCH con target_currency: null sobre una cuota en EUR (base COP) debería ser 400 o volver a COP; hoy es 200 y solo escribe updated_at', async () => {
    db.rows.sales_targets.find((t) => t.id === 't-1')!.target_currency = 'EUR';
    const res = await patchTargetRoute(req('/x', 'PATCH', { target_currency: null }), params('t-1'));
    // Lo honesto: 400 (field target_currency) o 200 con la moneda base. Nunca un 200 sin efecto.
    const json = await res.json();
    const after = db.rows.sales_targets.find((t) => t.id === 't-1')!.target_currency;
    expect(res.status === 400 ? json.field === 'target_currency' : after === 'COP').toBe(true);
  });

  it('evidencia del hueco anterior: PATCH target_currency: null → 200, la cuota sigue en EUR y el UPDATE solo lleva updated_at', async () => {
    db.rows.sales_targets.find((t) => t.id === 't-1')!.target_currency = 'EUR';
    const res = await patchTargetRoute(req('/x', 'PATCH', { target_currency: null }), params('t-1'));
    expect(res.status).toBe(200);
    expect(db.rows.sales_targets.find((t) => t.id === 't-1')!.target_currency).toBe('EUR');
    expect(Object.keys(updates()[0].row!)).toEqual(['updated_at']);
  });

  it('validateQuotaPatch con target_currency: null devuelve un patch sin la clave efectiva (evidencia del hueco anterior)', () => {
    const v = validateQuotaPatch({ target_currency: null }, { period: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30', target_amount: 1000, target_type: 'revenue', target_currency: 'COP' });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value).toEqual({ target_currency: undefined });
  });

  it('resumen: currency null, «» y « cop » (minúsculas con espacios) cuentan como la base; nada va a others', () => {
    const s = summarizeCommissionsByCurrency(
      [
        { status: 'accrued', commission_amount: 1, currency: null },
        { status: 'accrued', commission_amount: 2, currency: '' },
        { status: 'accrued', commission_amount: 4, currency: ' cop ' },
      ],
      'COP'
    );
    expect(s.primary).toMatchObject({ currency: 'COP', pending_total: 7, count: 3 });
    expect(s.others).toEqual([]);
  });

  it('panel del vendedor: org sin moneda base y sin comisiones → currency null (el cliente cae a la de la org), sin 500', async () => {
    session.organizationId = 121;
    session.userId = 'u-ajeno';
    db.rows.organization_currencies = [];
    db.rows.commissions = [];
    const res = await dashboardRoute(req('/api/crm/seller-dashboard', 'GET'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.currency).toBeNull();
  });
});

describe('R3T-5 — organization_id ajeno en el QUERY de las lecturas', () => {
  it('GET /api/crm/commissions?organization_id=121 nunca devuelve filas de la 121 (la sesión manda)', async () => {
    const res = await listRoute(req('/api/crm/commissions?organization_id=121', 'GET'));
    const json = await res.json();
    if (res.status === 200) {
      expect(json.data.every((c: Row) => c.organization_id === 120)).toBe(true);
      expect(json.data.map((c: Row) => c.id)).not.toContain('c-9');
    } else {
      expect(res.status).toBe(403);
    }
  });

  it('GET /api/crm/sales-targets?organization_id=121 y ?user_id=u-ajeno: ninguna cuota de la 121', async () => {
    const res = await listTargetsRoute(req('/api/crm/sales-targets?organization_id=121&user_id=u-ajeno', 'GET'));
    const json = await res.json();
    if (res.status === 200) expect(json.data.map((t: Row) => t.id)).not.toContain('t-9');
    else expect(res.status).toBe(403);
  });

  it('GET /api/crm/seller-dashboard?organization_id=121: cuota y comisiones solo de la 120', async () => {
    session.userId = 'u-1';
    const res = await dashboardRoute(req('/api/crm/seller-dashboard?organization_id=121', 'GET'));
    const json = await res.json();
    if (res.status === 200) {
      expect(json.data.quota?.id ?? 't-1').toBe('t-1');
      // u-1 tiene 3 en la 120 y 1 señuelo (c-9) en la 121: si se colara, serían 4.
      expect(json.data.commissions.count).toBe(3);
    } else {
      expect(res.status).toBe(403);
    }
  });
});

describe('R3T-6 — lotes malformados y motivo sin tope', () => {
  it('bulk-pay con commission_ids como texto, objeto o números → 400 sin escribir; [1, null, "", "c-1"] paga solo c-1', async () => {
    for (const ids of ['c-1', { 0: 'c-1' }, [1, 2]]) {
      const res = await bulkPayRoute(req('/x', 'POST', { commission_ids: ids }));
      expect(res.status).toBe(400);
    }
    expect(db.writes).toHaveLength(0);
    const res = await bulkPayRoute(req('/x', 'POST', { commission_ids: [1, null, '', 'c-1'] }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ paid: ['c-1'], failed: [] });
    expect(updates()).toHaveLength(1);
  });

  it('bulk-pay con 201 ids → 400 sin tocar ninguna; 200 ids repetidos se deduplican a una', async () => {
    const many = Array.from({ length: 201 }, (_, i) => `c-${i}`);
    const res = await bulkPayRoute(req('/x', 'POST', { commission_ids: many }));
    expect(res.status).toBe(400);
    expect(db.writes).toHaveLength(0);
    const dup = await bulkPayRoute(req('/x', 'POST', { commission_ids: Array.from({ length: 200 }, () => 'c-1') }));
    expect(dup.status).toBe(200);
    expect((await dup.json()).data.paid).toEqual(['c-1']);
    expect(updates()).toHaveLength(1);
  });

  it.failing(`HUECO: el motivo de reject/clawback no tiene tope en el servidor (la UI limita a ${REASON_MAX}); 10 000 caracteres deberían ser 400`, async () => {
    const res = await rejectRoute(req('/x', 'POST', { reason: 'x'.repeat(10_000) }), params('c-1'));
    expect(res.status).toBe(400);
  });

  it('evidencia del hueco: hoy el motivo de 10 000 caracteres se guarda íntegro en notes', async () => {
    const res = await rejectRoute(req('/x', 'POST', { reason: 'x'.repeat(10_000) }), params('c-1'));
    expect(res.status).toBe(200);
    expect(String(row('c-1').notes)).toHaveLength(10_000);
  });
});
