/// <reference types="jest" />
/**
 * F13 — ronda 2, pruebas del TESTER sobre lo que el constructor dice haber
 * cerrado: regla dura 5 con valores raros, `progress` GET con query ajeno,
 * resumen con 3 monedas y sin base, PATCH cambiando `period`, errores de BD
 * en `getOrgTimezone`, y el orden de foco cuando no hay fila siguiente.
 */

import { createFakeSupabase, type FakeDb, type Row } from './f13FakeSupabase';

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
// Extiende la clase real: `readOrgBody` (punto único) lanza la real y las rutas hacen `instanceof`.
class FakeOrgContextError extends RealOrgContextError {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode = 401, code = 'UNAUTHORIZED') {
    super(message, statusCode, code);
    this.statusCode = statusCode;
    this.code = code;
  }
}

let db: FakeDb;
const session = { roleId: 2, userId: 'u-admin', isSuperAdmin: false, organizationId: 120 };

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError, // la clase real: `readOrgBody` lanza la real y las rutas hacen `instanceof`
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
import { foreignOrganizationInBody } from '@/lib/security/organizationBody';
import { foreignOrganizationInBody as reexported } from '../voiceLibrary';
import { rejectForeignOrganization } from '../f13RouteSupport';
import { resolvePrimaryCurrency, summarizeCommissionsByCurrency } from '../commissionTransitions';
import { validateQuotaPatch, type QuotaInput } from '../quotaProgress';
import { DataSourceError } from '../salesTargetService';
import { getOrgTimezone } from '../sellerDashboardService';
import { focusAfterCommissionAction, pluralComisiones } from '@/components/finanzas/comisiones/comisionesModel';
import { GET as progressRoute } from '@/app/api/crm/sales-targets/progress/route';
import { GET as listRoute } from '@/app/api/crm/commissions/route';
import { GET as dashboardRoute } from '@/app/api/crm/seller-dashboard/route';
import { POST as payRoute } from '@/app/api/crm/commissions/[id]/pay/route';

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
      organization_currencies: [{ organization_id: 120, currency_code: 'COP', is_base: true }],
      organization_members: [{ id: 1, organization_id: 120, user_id: 'u-1', is_active: true }, { id: 2, organization_id: 120, user_id: 'u-admin', is_active: true }],
      profiles: [{ id: 'u-1', first_name: 'Ana', last_name: 'V', email: 'a@x' }, { id: 'u-admin', first_name: 'Admin', last_name: '', email: 'ad@x' }],
      commissions: [C('c-1', 120), C('c-2', 120, { currency: 'USD', commission_amount: 11344.54 }), C('c-3', 120, { currency: 'EUR', commission_amount: 7, status: 'paid', paid_at: 'P' }), C('c-9', 121)],
      sales_targets: [{ id: 't-1', organization_id: 120, user_id: 'u-1', period: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30', target_amount: 1000, target_currency: 'COP', target_type: 'revenue', achieved_amount: 0 }],
      opportunities: [], tasks: [], activities: [], calls: [], stages: [],
    },
  };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const supa = () => createFakeSupabase(db) as unknown as import('@supabase/supabase-js').SupabaseClient;

beforeEach(() => {
  db = seed();
  session.roleId = 2; session.userId = 'u-admin'; session.isSuperAdmin = false; session.organizationId = 120;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('R2T-1 — regla dura 5: una sola implementación y valores raros', () => {
  it('voiceLibrary reexporta EXACTAMENTE la misma función (F10/Voces no cambian de contrato)', () => {
    expect(reexported).toBe(foreignOrganizationInBody);
  });

  it.each([
    [120, null], ['120', null], [' 120 ', null], [120.0, null], [undefined, null], [null, null], ['', null], ['   ', null],
    [121, 121], ['121', '121'], [0, 0], ['abc', 'abc'], [-120, -120], ['120abc', '120abc'], [true, true],
  ])('foreignOrganizationInBody(%p, 120) → %p', (claimed, expected) => {
    expect(foreignOrganizationInBody(claimed, 120)).toEqual(expected);
  });

  it('rejectForeignOrganization: «120» (texto) pasa sin registrar; «121» lanza 403 FOREIGN_ORGANIZATION y registra', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Deuda C de F0-SEC (2026-09-16): el envoltorio recibe el body completo y delega en `readOrgBody`.
    expect(() => rejectForeignOrganization('T', { organization_id: '120' }, { organizationId: 120, userId: 'u-1' })).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
    expect(() => rejectForeignOrganization('T', { organization_id: '121' }, { organizationId: 120, userId: 'u-1' })).toThrow(expect.objectContaining({ statusCode: 403, code: 'FOREIGN_ORGANIZATION' }));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('organization_id ajeno'), expect.objectContaining({ route: 'T', session: 120, body: '121' }));
  });

  it('progress GET con ?organization_id=121 → 403 y NO escribe achieved_amount; con 120 → 200 y escribe acotado', async () => {
    const r1 = await progressRoute(req('/api/crm/sales-targets/progress?user_id=u-1&period=monthly&organization_id=121', 'GET'));
    expect(r1.status).toBe(403);
    expect(db.writes).toHaveLength(0);
    const r2 = await progressRoute(req('/api/crm/sales-targets/progress?user_id=u-1&period=monthly&organization_id=120', 'GET'));
    expect(r2.status).toBe(200);
    expect(db.writes.filter((w) => w.op === 'update' && w.table === 'sales_targets').map((w) => w.filters)).toEqual([{ id: 't-1', organization_id: 120 }]);
  });

  it('pay con body {organization_id: "120"} (texto, misma org) → 200 y paga', async () => {
    const r = await payRoute(req('/x', 'POST', { organization_id: '120' }), params('c-1'));
    expect(r.status).toBe(200);
    expect(db.rows.commissions.find((c) => c.id === 'c-1')!.status).toBe('paid');
  });
});

describe('R2T-2 — resumen por moneda con 3 monedas y sin base', () => {
  const rows = [
    { status: 'accrued', commission_amount: 100, currency: 'COP' },
    { status: 'accrued', commission_amount: 11344.54, currency: 'USD' },
    { status: 'paid', commission_amount: 7, currency: 'EUR' },
    { status: 'paid', commission_amount: 3, currency: 'eur' },
    { status: 'accrued', commission_amount: 5, currency: null },
  ];

  it('base COP: principal = COP (incluye la de currency null), others = [EUR(10 pagado), USD] ordenadas; ninguna suma cruza', () => {
    const s = summarizeCommissionsByCurrency(rows, 'COP');
    expect(s.primary).toMatchObject({ currency: 'COP', pending_total: 105, paid_total: 0, count: 2 });
    expect(s.others.map((o) => o.currency)).toEqual(['EUR', 'USD']);
    expect(s.others[0]).toMatchObject({ paid_total: 10, count: 2 });
    expect(s.others[1]).toMatchObject({ pending_total: 11344.54, count: 1 });
    const all = [s.primary, ...s.others].reduce((a, o) => a + o.accrued_total, 0);
    expect(all).toBeCloseTo(105 + 10 + 11344.54, 2); // nada se pierde, nada se mezcla
  });

  it('sin base: la más frecuente manda; empate → alfabético; sin filas → null', () => {
    expect(resolvePrimaryCurrency(rows, null)).toBe('EUR'); // EUR 2 filas (7 + 3)
    expect(resolvePrimaryCurrency([{ currency: 'USD' }, { currency: 'COP' }], null)).toBe('COP');
    expect(resolvePrimaryCurrency([], null)).toBeNull();
    const s = summarizeCommissionsByCurrency(rows, null);
    expect(s.primary.currency).toBe('EUR');
    expect(s.others.map((o) => o.currency)).toEqual(['COP', 'USD']);
  });

  it('GET /api/crm/commissions: summary solo COP; summary_others EUR y USD; currency de la org', async () => {
    const json = await (await listRoute(req('/api/crm/commissions', 'GET'))).json();
    expect(json.currency).toBe('COP');
    expect(json.summary).toMatchObject({ currency: 'COP', pending_total: 100, paid_total: 0 });
    expect(json.summary_others.map((o: { currency: string }) => o.currency)).toEqual(['EUR', 'USD']);
  });

  it('panel del vendedor: commissions solo en la base y commissions_others con EUR/USD del mes', async () => {
    jest.useFakeTimers({ now: new Date('2026-09-15T20:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    session.userId = 'u-1';
    const json = await (await dashboardRoute()).json();
    expect(json.data.commissions).toEqual({ accrued: 100, paid: 0, total: 100, count: 1 });
    expect(json.data.commissions_others.map((o: { currency: string }) => o.currency)).toEqual(['EUR', 'USD']);
    jest.useRealTimers();
  });
});

describe('R2T-3 — PATCH cambiando period', () => {
  const existing: QuotaInput = { period: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30', target_amount: 10, target_type: 'revenue', target_currency: 'COP' };
  it('solo period=quarterly sin tocar límites → error (el mes no es un trimestre); yearly igual', () => {
    expect(validateQuotaPatch({ period: 'quarterly' }, existing)).toMatchObject({ ok: false, field: 'period_start' });
    expect(validateQuotaPatch({ period: 'yearly' }, existing)).toMatchObject({ ok: false, field: 'period_start' });
  });
  it('period=quarterly con límites del trimestre natural → ok con los tres campos', () => {
    expect(validateQuotaPatch({ period: 'quarterly', period_start: '2026-07-01', period_end: '2026-09-30' }, existing)).toEqual({
      ok: true, value: { period: 'quarterly', period_start: '2026-07-01', period_end: '2026-09-30' },
    });
  });
  it('period_start solo, coherente (mismo mes) → ok; a otro mes sin period_end → error en period_end', () => {
    expect(validateQuotaPatch({ period_start: '2026-09-01' }, existing)).toEqual({ ok: true, value: { period_start: '2026-09-01' } });
    expect(validateQuotaPatch({ period_start: '2026-10-01' }, existing)).toMatchObject({ ok: false, field: 'period_end' });
  });
});

describe('R2T-4 — getOrgTimezone', () => {
  it('error de BD → DataSourceError (502), nunca un fallback silencioso', async () => {
    db.nextReadError = { table: 'organizations', error: { code: 'XX000', message: 'boom' } };
    await expect(getOrgTimezone(120, supa())).rejects.toBeInstanceOf(DataSourceError);
    const r = await dashboardRoute();
    // segunda lectura sin error simulado → 200; simulamos de nuevo para la ruta
    expect([200, 502]).toContain(r.status);
    db.nextReadError = { table: 'organizations', error: { code: 'XX000', message: 'boom' } };
    const r2 = await dashboardRoute();
    expect(r2.status).toBe(502);
    expect((await r2.json()).code).toBe('UPSTREAM_DATA');
  });
  it('organización sin fila (no debería pasar con sesión válida) → fallback documentado America/Bogota', async () => {
    expect(await getOrgTimezone(999, supa())).toBe('America/Bogota');
  });
});

describe('R2T-5 — foco: orden de candidatos', () => {
  const el = (connected: boolean) => ({ isConnected: connected });
  it('sin fila siguiente ni «Actualizar» → «Seleccionar todas»; sin ninguno → null (y el opener desconectado no cuenta)', () => {
    const selectAll = el(true);
    expect(focusAfterCommissionAction(el(false), [null, undefined, selectAll])).toBe(selectAll);
    expect(focusAfterCommissionAction(el(false), [el(false), el(false), el(false)])).toBeNull();
    expect(focusAfterCommissionAction(null, [])).toBeNull();
    const opener = el(true);
    expect(focusAfterCommissionAction(opener, [selectAll])).toBe(opener);
  });
  it('pluralComisiones: 1 comisión pagada / 2 comisiones pagadas (sin tilde en el plural)', () => {
    expect(pluralComisiones(1, 'pagada')).toBe('1 comisión pagada');
    expect(pluralComisiones(2, 'pagada')).toBe('2 comisiones pagadas');
    expect(pluralComisiones(7)).toBe('7 comisiones');
  });
});
