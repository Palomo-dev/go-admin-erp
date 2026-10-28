import { agruparAuxiliar, type FilaAuxiliarDetalle } from '@/components/finanzas/contabilidad/ReportesContablesService';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

const f = (nit: string, cuenta: string, debit: number, credit: number, ini: number, corrido: number): FilaAuxiliarDetalle => ({
  tercero_nit: nit, tercero_nombre: nit, account_code: cuenta, journal_entry_id: 1, entry_date: '2026-01-02T00:00:00Z',
  memo: null, debit, credit, saldo_inicial: ini, saldo_corrido: corrido,
});

describe('auxiliar por tercero con saldo corrido', () => {
  it('agrupa por tercero y cuenta con saldo inicial y final', () => {
    const g = agruparAuxiliar([f('900', '130505', 100, 0, 50, 150), f('900', '130505', 0, 30, 50, 120), f('800', '220505', 0, 10, 0, 10)]);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ saldo_inicial: 50, saldo_final: 120, debitos: 100, creditos: 30 });
    expect(g[1].saldo_final).toBe(10);
  });
});
