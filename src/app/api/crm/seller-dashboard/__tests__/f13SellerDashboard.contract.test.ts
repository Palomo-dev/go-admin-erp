/// <reference types="jest" />
/**
 * F13 — contrato de `GET /api/crm/seller-dashboard` (widgets de `/app/inicio`).
 * Doble con señuelos de la org 121; el ranking solo aparece para admin/manager
 * (rol de la sesión, resuelto en servidor); las fechas «hoy» y «este mes» salen
 * de la zona horaria de la organización.
 */

import { createFakeSupabase, type FakeDb } from '@/lib/services/crm/__tests__/f13FakeSupabase';

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
const session = { roleId: 4, userId: 'u-1', isSuperAdmin: false };

// Hoy fijo: 2026-09-15 20:30 Bogotá = 2026-09-16 01:30 UTC (el día calendario depende de la zona).
const NOW_UTC = '2026-09-16T01:30:00Z';

function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      organizations: [{ id: 120, timezone: 'America/Bogota' }, { id: 121, timezone: 'UTC' }],
      organization_currencies: [{ organization_id: 120, currency_code: 'COP', is_base: true }, { organization_id: 121, currency_code: 'USD', is_base: true }],
      organization_members: [
        { id: 1, organization_id: 120, user_id: 'u-1', is_active: true },
        { id: 2, organization_id: 120, user_id: 'u-2', is_active: true },
        { id: 3, organization_id: 120, user_id: 'u-3', is_active: false },
        { id: 9, organization_id: 121, user_id: 'u-9', is_active: true },
      ],
      profiles: [
        { id: 'u-1', first_name: 'Ana', last_name: 'V', email: 'a@x' },
        { id: 'u-2', first_name: 'Beto', last_name: null, email: 'b@x' },
        { id: 'u-9', first_name: 'Ajeno', last_name: null, email: 'z@x' },
      ],
      sales_targets: [
        { id: 't-m', organization_id: 120, user_id: 'u-1', period: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30', target_amount: 1000, target_currency: 'COP', target_type: 'revenue', achieved_amount: 0 },
        { id: 't-q', organization_id: 120, user_id: 'u-1', period: 'quarterly', period_start: '2026-07-01', period_end: '2026-09-30', target_amount: 5000, target_currency: 'COP', target_type: 'revenue', achieved_amount: 0 },
        { id: 't-9', organization_id: 121, user_id: 'u-1', period: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30', target_amount: 77, target_currency: 'USD', target_type: 'revenue', achieved_amount: 0 },
      ],
      stages: [{ id: 's-1', name: 'Propuesta' }],
      opportunities: [
        { id: 'op-1', organization_id: 120, salesperson_id: 'u-1', status: 'won', amount: 300, closed_at: '2026-09-10T15:00:00Z', name: 'Ganada', currency: 'COP', expected_close_date: null, stage_id: 's-1' },
        { id: 'op-2', organization_id: 120, salesperson_id: 'u-2', status: 'won', amount: 900, closed_at: '2026-09-12T15:00:00Z', name: 'Ganada 2', currency: 'COP', expected_close_date: null, stage_id: 's-1' },
        { id: 'op-3', organization_id: 120, salesperson_id: 'u-1', status: 'open', amount: 50, closed_at: null, name: 'Chica', currency: 'COP', expected_close_date: '2026-09-20', stage_id: 's-1' },
        { id: 'op-4', organization_id: 120, salesperson_id: 'u-1', status: 'open', amount: 700, closed_at: null, name: 'Grande', currency: 'COP', expected_close_date: null, stage_id: 's-1' },
        { id: 'op-5', organization_id: 120, salesperson_id: 'u-2', status: 'open', amount: 999, closed_at: null, name: 'De otro', currency: 'COP', expected_close_date: null, stage_id: 's-1' },
        { id: 'op-9', organization_id: 121, salesperson_id: 'u-1', status: 'open', amount: 8888, closed_at: null, name: 'Ajena', currency: 'USD', expected_close_date: null, stage_id: 's-1' },
        { id: 'op-8', organization_id: 121, salesperson_id: 'u-1', status: 'won', amount: 8888, closed_at: '2026-09-10T15:00:00Z', name: 'Ajena ganada', currency: 'USD', expected_close_date: null, stage_id: 's-1' },
      ],
      commissions: [
        { id: 'c-1', organization_id: 120, payee_id: 'u-1', status: 'accrued', commission_amount: 30, accrued_at: '2026-09-05T15:00:00Z' },
        { id: 'c-2', organization_id: 120, payee_id: 'u-1', status: 'paid', commission_amount: 20, accrued_at: '2026-09-06T15:00:00Z' },
        { id: 'c-3', organization_id: 120, payee_id: 'u-1', status: 'accrued', commission_amount: 500, accrued_at: '2026-08-06T15:00:00Z' }, // otro mes
        { id: 'c-4', organization_id: 120, payee_id: 'u-2', status: 'accrued', commission_amount: 400, accrued_at: '2026-09-06T15:00:00Z' }, // otro miembro
        { id: 'c-9', organization_id: 121, payee_id: 'u-1', status: 'accrued', commission_amount: 9999, accrued_at: '2026-09-06T15:00:00Z' },
      ],
      tasks: [
        { id: 'k-1', organization_id: 120, assigned_to: 'u-1', status: 'open', title: 'Llamar', due_date: '2026-09-15T14:00:00Z', priority: 'high' },
        { id: 'k-2', organization_id: 120, assigned_to: 'u-1', status: 'open', title: 'Mañana (01:30 Bogotá del 16)', due_date: '2026-09-16T06:30:00Z', priority: 'low' },
        { id: 'k-3', organization_id: 120, assigned_to: 'u-1', status: 'done', title: 'Hecha', due_date: '2026-09-15T14:00:00Z', priority: 'low' },
        { id: 'k-4', organization_id: 120, assigned_to: 'u-2', status: 'open', title: 'De otro', due_date: '2026-09-15T14:00:00Z', priority: 'low' },
        { id: 'k-9', organization_id: 121, assigned_to: 'u-1', status: 'open', title: 'Ajena', due_date: '2026-09-15T14:00:00Z', priority: 'low' },
      ],
      activities: [],
      calls: [],
    },
  };
}

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError, // la clase real: `readOrgBody` lanza la real y las rutas hacen `instanceof`
  requireOrgAdmin: jest.fn(),
  getServerOrgContext: jest.fn(async () => ({
    organizationId: 120,
    userId: session.userId,
    roleId: session.roleId,
    roleName: 'x',
    isSuperAdmin: session.isSuperAdmin,
    supabase: createFakeSupabase(db),
  })),
}));

import { GET } from '../route';

beforeEach(() => {
  db = seed();
  session.roleId = 4;
  session.userId = 'u-1';
  session.isSuperAdmin = false;
  jest.useFakeTimers({ now: new Date(NOW_UTC), doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout'] });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('GET /api/crm/seller-dashboard', () => {
  it('vendedor (rol 4): cuota mensual vigente con progreso real, comisiones del mes, top oportunidades y tareas de hoy; sin ranking', async () => {
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    const d = body.data;
    expect(d.today).toBe('2026-09-15'); // Bogotá, no el 16 de UTC
    expect(d.timezone).toBe('America/Bogota');
    expect(d.currency).toBe('COP');
    expect(d.month_start).toBe('2026-09-01');
    expect(d.quota.target.id).toBe('t-m');
    expect(d.quota.target.achieved_amount).toBe(300);
    expect(d.quota.progress).toMatchObject({ pct: 30, remaining: 700, days_remaining: 16 });
    expect(d.commissions).toEqual({ accrued: 30, paid: 20, total: 50, count: 2 });
    expect(d.opportunities.map((o: { id: string }) => o.id)).toEqual(['op-4', 'op-3']);
    expect(d.opportunities[0].stage_name).toBe('Propuesta');
    expect(d.tasks_today.map((t: { id: string }) => t.id)).toEqual(['k-1']);
    expect(d.leaderboard).toBeNull();
    expect(db.writes).toEqual([]);
  });

  it('manager (rol 5): ranking del mes con miembros activos de la org, ganado por vendedor y marca de «yo»', async () => {
    session.roleId = 5;
    const body = await (await GET()).json();
    expect(body.data.leaderboard).toEqual([
      { rank: 1, user_id: 'u-2', name: 'Beto', amount: 900, deals: 1, is_me: false },
      { rank: 2, user_id: 'u-1', name: 'Ana V', amount: 300, deals: 1, is_me: true },
    ]);
  });

  it('sin cuota vigente → quota null (el widget muestra el estado vacío honesto)', async () => {
    db.rows.sales_targets = db.rows.sales_targets.filter((t) => t.id === 't-9');
    const body = await (await GET()).json();
    expect(body.data.quota).toBeNull();
  });

  it('no acepta parámetros: el panel es del usuario de la sesión (nada del query)', async () => {
    const body = await (await GET()).json();
    expect(body.data.commissions.accrued).toBe(30);
  });
});
