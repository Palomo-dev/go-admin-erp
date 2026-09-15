/// <reference types="jest" />
/**
 * F13 — máquina de estados de comisiones (`commissionTransitions.ts`).
 * La BD solo admite `accrued | paid | cancelled` (CHECK verificado por MCP):
 * «rechazar» y «clawback» son `cancelled` con `metadata.reason`.
 */
import {
  COMMISSION_ACTIONS,
  CommissionTransitionError,
  buildTransitionPatch,
  canManageCommissions,
  canTransition,
  cancellationKind,
  summarizeCommissions,
  transitionFor,
} from '../commissionTransitions';

const NOW = '2026-09-15T15:00:00.000Z';

describe('transiciones permitidas', () => {
  it('accrued→paid, accrued→cancelled(rejected), paid→cancelled(clawback); nada más', () => {
    expect(canTransition('accrued', 'pay')).toBe(true);
    expect(canTransition('accrued', 'reject')).toBe(true);
    expect(canTransition('paid', 'clawback')).toBe(true);
    expect(canTransition('paid', 'pay')).toBe(false);
    expect(canTransition('paid', 'reject')).toBe(false);
    expect(canTransition('accrued', 'clawback')).toBe(false);
    expect(canTransition('cancelled', 'pay')).toBe(false);
    expect(canTransition('cancelled', 'reject')).toBe(false);
    expect(canTransition('cancelled', 'clawback')).toBe(false);
  });
  it('transitionFor expone el estado de partida que la escritura debe exigir con .eq', () => {
    expect(transitionFor('pay')).toEqual({ from: 'accrued', to: 'paid' });
    expect(transitionFor('reject')).toEqual({ from: 'accrued', to: 'cancelled' });
    expect(transitionFor('clawback')).toEqual({ from: 'paid', to: 'cancelled' });
    expect(COMMISSION_ACTIONS).toEqual(['pay', 'reject', 'clawback']);
  });
});

describe('buildTransitionPatch', () => {
  const paidRow = { status: 'paid', paid_at: '2026-09-01T10:00:00Z', metadata: { opportunity_id: 'op-1' }, notes: 'nota previa' };
  const accruedRow = { status: 'accrued', paid_at: null, metadata: null, notes: null };

  it('pay: status paid + paid_at, sin tocar metadata', () => {
    expect(buildTransitionPatch('pay', accruedRow, { now: NOW })).toEqual({ status: 'paid', paid_at: NOW, updated_at: NOW });
  });
  it('reject: cancelled con reason=rejected en metadata y motivo en notes', () => {
    expect(buildTransitionPatch('reject', accruedRow, { now: NOW, reason: 'Oportunidad perdida', actorId: 'u-1' })).toEqual({
      status: 'cancelled',
      notes: 'Oportunidad perdida',
      updated_at: NOW,
      metadata: { reason: 'rejected', rejected_at: NOW, rejected_by: 'u-1' },
    });
  });
  it('clawback: conserva metadata previa, guarda paid_at_before_clawback y NO borra paid_at (hecho contable)', () => {
    expect(buildTransitionPatch('clawback', paidRow, { now: NOW, reason: 'Reembolso al cliente', actorId: 'u-1' })).toEqual({
      status: 'cancelled',
      notes: 'Reembolso al cliente',
      updated_at: NOW,
      metadata: {
        opportunity_id: 'op-1',
        reason: 'clawback',
        clawback_of_paid: true,
        paid_at_before_clawback: '2026-09-01T10:00:00Z',
        clawback_at: NOW,
        clawback_by: 'u-1',
      },
    });
  });
  it('reject y clawback exigen motivo no vacío', () => {
    expect(() => buildTransitionPatch('reject', accruedRow, { now: NOW, reason: '   ' })).toThrow(CommissionTransitionError);
    expect(() => buildTransitionPatch('clawback', paidRow, { now: NOW })).toThrow(/motivo/i);
  });
  it('lanza CommissionTransitionError (409) si el estado de partida no coincide', () => {
    try {
      buildTransitionPatch('pay', paidRow, { now: NOW });
      throw new Error('no lanzó');
    } catch (e) {
      expect(e).toBeInstanceOf(CommissionTransitionError);
      expect((e as CommissionTransitionError).statusCode).toBe(409);
      expect((e as CommissionTransitionError).code).toBe('INVALID_TRANSITION');
    }
  });
});

describe('cancellationKind', () => {
  it('distingue rechazo, clawback y cancelación sin motivo', () => {
    expect(cancellationKind({ reason: 'rejected' })).toBe('rejected');
    expect(cancellationKind({ reason: 'clawback', clawback_of_paid: true })).toBe('clawback');
    expect(cancellationKind(null)).toBe('cancelled');
    expect(cancellationKind({ other: 1 })).toBe('cancelled');
  });
});

describe('summarizeCommissions', () => {
  const rows = [
    { status: 'accrued', commission_amount: 100, metadata: null },
    { status: 'accrued', commission_amount: '50.5', metadata: null },
    { status: 'paid', commission_amount: 200, metadata: null },
    { status: 'cancelled', commission_amount: 30, metadata: { reason: 'rejected' } },
    { status: 'cancelled', commission_amount: 70, metadata: { reason: 'clawback' } },
  ];
  it('devengado = pendiente + pagado; canceladas aparte, con desglose', () => {
    expect(summarizeCommissions(rows)).toEqual({
      accrued_total: 350.5,
      pending_total: 150.5,
      paid_total: 200,
      cancelled_total: 100,
      rejected_total: 30,
      clawback_total: 70,
      count: 5,
      count_pending: 2,
      count_paid: 1,
      count_cancelled: 2,
    });
  });
  it('lista vacía → ceros', () => {
    expect(summarizeCommissions([]).accrued_total).toBe(0);
    expect(summarizeCommissions([]).count).toBe(0);
  });
});

describe('canManageCommissions (servidor, por id de rol, nunca por nombre)', () => {
  it('admin (1, 2) y manager (5) sí; empleado (4) y cliente (3) no; super admin siempre', () => {
    expect(canManageCommissions({ roleId: 1, isSuperAdmin: false })).toBe(true);
    expect(canManageCommissions({ roleId: 2, isSuperAdmin: false })).toBe(true);
    expect(canManageCommissions({ roleId: 5, isSuperAdmin: false })).toBe(true);
    expect(canManageCommissions({ roleId: 4, isSuperAdmin: false })).toBe(false);
    expect(canManageCommissions({ roleId: 3, isSuperAdmin: false })).toBe(false);
    expect(canManageCommissions({ roleId: 4, isSuperAdmin: true })).toBe(true);
  });
});
