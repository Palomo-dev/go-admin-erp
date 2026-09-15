/// <reference types="jest" />
/**
 * F13 — modelo puro del panel del vendedor (`sellerDashboardModel.ts`).
 */
import {
  buildLeaderboard,
  canSeeLeaderboard,
  pickCurrentQuota,
  quotaEmptyMessage,
  summarizeMonthCommissions,
  topOpenOpportunities,
  tasksDueOn,
} from '../sellerDashboardModel';

describe('pickCurrentQuota', () => {
  const t = (id: string, period: string, start: string, end: string, type = 'revenue') => ({ id, period, period_start: start, period_end: end, target_type: type });
  it('prefiere la mensual vigente sobre trimestral/anual, y la de ingresos si hay varias', () => {
    const list = [
      t('y', 'yearly', '2026-01-01', '2026-12-31'),
      t('q', 'quarterly', '2026-07-01', '2026-09-30'),
      t('m-calls', 'monthly', '2026-09-01', '2026-09-30', 'calls'),
      t('m', 'monthly', '2026-09-01', '2026-09-30'),
    ];
    expect(pickCurrentQuota(list, '2026-09-15')?.id).toBe('m');
  });
  it('cae a la trimestral si no hay mensual vigente, y a la anual después', () => {
    expect(pickCurrentQuota([t('q', 'quarterly', '2026-07-01', '2026-09-30'), t('y', 'yearly', '2026-01-01', '2026-12-31')], '2026-09-15')?.id).toBe('q');
    expect(pickCurrentQuota([t('y', 'yearly', '2026-01-01', '2026-12-31')], '2026-09-15')?.id).toBe('y');
  });
  it('ignora las que no cubren hoy; sin cuota → null', () => {
    expect(pickCurrentQuota([t('m', 'monthly', '2026-08-01', '2026-08-31')], '2026-09-15')).toBeNull();
    expect(pickCurrentQuota([], '2026-09-15')).toBeNull();
  });
  it('quotaEmptyMessage es honesto: no inventa cifras', () => {
    expect(quotaEmptyMessage()).toMatch(/sin cuota este mes/i);
    expect(quotaEmptyMessage()).toMatch(/administrador/i);
  });
});

describe('buildLeaderboard', () => {
  const members = [
    { user_id: 'u-1', name: 'Ana' },
    { user_id: 'u-2', name: 'Beto' },
    { user_id: 'u-3', name: 'Cata' },
  ];
  it('ordena por importe ganado desc, numera, marca al usuario actual e incluye miembros sin ventas', () => {
    const won = [
      { salesperson_id: 'u-2', amount: 500 },
      { salesperson_id: 'u-1', amount: 300 },
      { salesperson_id: 'u-2', amount: 100 },
      { salesperson_id: 'u-9', amount: 9999 }, // no es miembro: fuera
    ];
    expect(buildLeaderboard(won, members, 'u-1')).toEqual([
      { rank: 1, user_id: 'u-2', name: 'Beto', amount: 600, deals: 2, is_me: false },
      { rank: 2, user_id: 'u-1', name: 'Ana', amount: 300, deals: 1, is_me: true },
      { rank: 3, user_id: 'u-3', name: 'Cata', amount: 0, deals: 0, is_me: false },
    ]);
  });
  it('empate: mantiene orden estable por nombre', () => {
    const r = buildLeaderboard([], members, 'u-3');
    expect(r.map((x) => x.name)).toEqual(['Ana', 'Beto', 'Cata']);
    expect(r[2].is_me).toBe(true);
  });
});

describe('canSeeLeaderboard (resuelto en servidor por id de rol)', () => {
  it('admin/manager/super admin sí; empleado no', () => {
    expect(canSeeLeaderboard({ roleId: 2, isSuperAdmin: false })).toBe(true);
    expect(canSeeLeaderboard({ roleId: 5, isSuperAdmin: false })).toBe(true);
    expect(canSeeLeaderboard({ roleId: 4, isSuperAdmin: false })).toBe(false);
    expect(canSeeLeaderboard({ roleId: 4, isSuperAdmin: true })).toBe(true);
  });
});

describe('summarizeMonthCommissions', () => {
  it('devengado vs pagado del mes (canceladas fuera)', () => {
    const rows = [
      { status: 'accrued', commission_amount: 120 },
      { status: 'paid', commission_amount: 80 },
      { status: 'cancelled', commission_amount: 999 },
    ];
    expect(summarizeMonthCommissions(rows)).toEqual({ accrued: 120, paid: 80, total: 200, count: 2 });
  });
});

describe('topOpenOpportunities / tasksDueOn', () => {
  it('top N abiertas por monto desc, nulos al final', () => {
    const opps = [
      { id: 'a', amount: null, status: 'open' },
      { id: 'b', amount: 50, status: 'open' },
      { id: 'c', amount: 900, status: 'won' },
      { id: 'd', amount: 700, status: 'open' },
    ];
    expect(topOpenOpportunities(opps, 2).map((o) => o.id)).toEqual(['d', 'b']);
    expect(topOpenOpportunities(opps, 5).map((o) => o.id)).toEqual(['d', 'b', 'a']);
  });
  it('tareas de hoy por día calendario en la zona de la organización', () => {
    const tasks = [
      { id: 't1', due_date: '2026-09-15T03:30:00Z', status: 'open' }, // 14 sep 22:30 en Bogotá
      { id: 't2', due_date: '2026-09-15T14:00:00Z', status: 'open' },
      { id: 't3', due_date: '2026-09-15T14:00:00Z', status: 'done' },
      { id: 't4', due_date: null, status: 'open' },
    ];
    expect(tasksDueOn(tasks, '2026-09-15', 'America/Bogota').map((t) => t.id)).toEqual(['t2']);
    expect(tasksDueOn(tasks, '2026-09-14', 'America/Bogota').map((t) => t.id)).toEqual(['t1']);
    expect(tasksDueOn(tasks, '2026-09-15', 'UTC').map((t) => t.id)).toEqual(['t1', 't2']);
  });
});
