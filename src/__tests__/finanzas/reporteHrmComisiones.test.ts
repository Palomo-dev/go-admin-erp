/// <reference types="jest" />
/**
 * Reporte HRM «Comisiones» (2026-09-28): antes recalculaba desde `sales`
 * comparando `commission_type === 'fixed'` (nunca ocurre) y sobre el total CON
 * impuestos. Ahora lee `commissions`: lo que de verdad se devengó.
 */
import { createFakeSupabase, type FakeDb } from '@/lib/services/crm/__tests__/f13FakeSupabase';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

import { hrmReports, resumirComisionesPorVendedor } from '@/lib/services/reportes/modulos/hrmReports';

describe('resumirComisionesPorVendedor', () => {
  it('suma lo devengado (monto fijo tal cual), separa pagado/pendiente, ignora canceladas y no mezcla monedas', () => {
    const filas = resumirComisionesPorVendedor([
      { payee_id: 'u-1', payee_name: 'Ana', base_amount: 34000, commission_amount: 5000, status: 'accrued', currency: 'COP' },
      { payee_id: 'u-1', payee_name: 'Ana', base_amount: '20000', commission_amount: '2000', status: 'paid', currency: 'COP' },
      { payee_id: 'u-1', payee_name: 'Ana', base_amount: 100, commission_amount: 10, status: 'cancelled', currency: 'COP' },
      { payee_id: 'u-1', payee_name: 'Ana', base_amount: 50, commission_amount: 5, status: 'accrued', currency: 'USD' },
    ]);
    expect(filas).toEqual([
      { vendedor_id: 'u-1', vendedor: 'Ana', moneda: 'COP', ventas: 2, total: 54000, comision: 7000, pagado: 2000, pendiente: 5000 },
      { vendedor_id: 'u-1', vendedor: 'Ana', moneda: 'USD', ventas: 1, total: 50, comision: 5, pagado: 0, pendiente: 5 },
    ]);
  });
});

describe('hrm-comisiones.fetch', () => {
  it('lee commissions de la organización (no sales) y respeta la sucursal', async () => {
    const db: FakeDb = {
      writes: [],
      rows: {
        commissions: [
          { organization_id: 120, branch_id: 1, payee_id: 'u-1', payee_name: 'Ana', base_amount: 34000, commission_amount: 5000, status: 'accrued', currency: 'COP', accrued_at: '2026-09-10T15:00:00Z' },
          { organization_id: 120, branch_id: 2, payee_id: 'u-2', payee_name: 'Beto', base_amount: 1000, commission_amount: 100, status: 'accrued', currency: 'COP', accrued_at: '2026-09-10T15:00:00Z' },
          { organization_id: 121, branch_id: 1, payee_id: 'u-9', payee_name: 'Ajeno', base_amount: 1, commission_amount: 999, status: 'accrued', currency: 'COP', accrued_at: '2026-09-10T15:00:00Z' },
        ],
        sales: [{ organization_id: 120, salesperson_id: 'u-1', commission_rate: 5000, commission_type: 'salesperson', total: 40460, sale_date: '2026-09-10T15:00:00Z', status: 'paid' }],
      },
    };
    const rep = hrmReports.find((r) => r.id === 'hrm-comisiones')!;
    const periodo = { tipo: 'mensual', fechaInicio: '2026-09-01', fechaFin: '2026-09-30', etiqueta: 'sep' } as never;
    const out = await rep.fetch(120, periodo, 1, createFakeSupabase(db) as never);
    expect(out.filas).toEqual([expect.objectContaining({ vendedor: 'Ana', comision: 5000, total: 34000 })]);
    expect(out.kpis[0].valor).toBe(5000);
  });
});
