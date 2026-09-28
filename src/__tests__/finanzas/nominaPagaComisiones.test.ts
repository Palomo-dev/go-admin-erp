/// <reference types="jest" />
/**
 * Nómina paga comisiones (2026-09-28): `updateSlipStatus('paid')` reemplazaba
 * TODO el metadata de la comisión por `{ payroll_slip_id }` (se perdían
 * sale_id, commission_method…) y actualizaba sin filtro de organización.
 */
import { createFakeSupabase, type FakeDb } from '@/lib/services/crm/__tests__/f13FakeSupabase';

let db: FakeDb;
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: (t: string) => createFakeSupabase(db).from(t) } }));
jest.mock('@/lib/services/timezoneResolver', () => ({ resolveTimezone: async () => 'America/Bogota' }));

import PayrollService, { metadataPagadaPorNomina } from '@/lib/services/payrollService';

beforeEach(() => {
  db = {
    writes: [],
    rows: {
      payroll_slips: [{ id: 'slip-1', status: 'approved', metadata: { commission_ids: ['c-1', 'c-2', 'c-9'] } }],
      commissions: [
        { id: 'c-1', organization_id: 120, status: 'accrued', metadata: { sale_id: 's-1', commission_method: 'fixed_amount' } },
        { id: 'c-2', organization_id: 120, status: 'paid', metadata: { sale_id: 's-2' } },
        // Señuelo: mismo id listado en la colilla pero de otra organización.
        { id: 'c-9', organization_id: 121, status: 'accrued', metadata: { sale_id: 's-9' } },
      ],
    },
  };
});

describe('metadataPagadaPorNomina', () => {
  it('fusiona: conserva lo previo y agrega la colilla', () => {
    expect(metadataPagadaPorNomina({ sale_id: 's-1', commission_method: 'percentage' }, 'slip-1')).toEqual({ sale_id: 's-1', commission_method: 'percentage', payroll_slip_id: 'slip-1' });
    expect(metadataPagadaPorNomina(null, 'slip-1')).toEqual({ payroll_slip_id: 'slip-1' });
  });
});

describe('updateSlipStatus(paid)', () => {
  it('paga solo las devengadas de su organización y conserva su metadata', async () => {
    const svc = new PayrollService(120);
    jest.spyOn(svc, 'getSlipById').mockResolvedValue(null);
    await svc.updateSlipStatus('slip-1', 'paid');

    const c1 = db.rows.commissions.find((c) => c.id === 'c-1')!;
    expect(c1).toMatchObject({ status: 'paid', metadata: { sale_id: 's-1', commission_method: 'fixed_amount', payroll_slip_id: 'slip-1' } });
    expect(db.rows.commissions.find((c) => c.id === 'c-9')).toMatchObject({ status: 'accrued', metadata: { sale_id: 's-9' } });
    expect(db.rows.commissions.find((c) => c.id === 'c-2')).toMatchObject({ status: 'paid', metadata: { sale_id: 's-2' } });

    const commUpdates = db.writes.filter((w) => w.table === 'commissions' && w.op === 'update');
    expect(commUpdates).toHaveLength(1);
    expect(commUpdates[0].filters).toMatchObject({ id: 'c-1', organization_id: 120, status: 'accrued' });
  });
});
