/**
 * Frente C (Finanzas ronda 3): lógica de Salud contable, Mayor contable e
 * Inicio de Contabilidad. Sin base; datos inventados.
 */
import {
  balanceCuadra,
  cuentasAgrupadorasConMovimiento,
  esFuncionInexistente,
  leerCruceSalud,
  saludSinProblemas,
} from '../saludLogica';
import { cuentaDeUrl, descripcionLinea, filasMayor, paginaDe, saldoMayor } from '../mayorLogica';
import { contarAgrupadoras, nombreMes, periodoActual, tonoAvisoInicio } from '../inicioContabilidadLogica';
import type { LedgerAccount } from '@/components/finanzas/contabilidad/ReportesContablesService';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

describe('saludLogica', () => {
  it('lee la respuesta de fn_salud_contable sin confiar en su forma', () => {
    const r = leerCruceSalud({
      descuadres: [{ tipo: 'factura', documento_id: 'a1', numero: 'FV-0988', subtipo: 'devengo_duplicado', total_documento: '119000', total_asiento: 138000, diferencia: 19000, asientos: [9312, 'x'] }],
      total_descuadres: 4,
      huerfanos: [{ asiento_id: 7, origen: 'sales', motivo: 'raro', importe: '42300' }],
    });
    expect(r.descuadres[0]).toMatchObject({ tipo: 'factura', numero: 'FV-0988', subtipo: 'devengo_duplicado', totalDocumento: 119000, asientos: [9312] });
    expect(r.totalDescuadres).toBe(4);
    expect(r.huerfanos[0]).toMatchObject({ asientoId: 7, motivo: 'documento_eliminado', importe: 42300 });
    expect(r.totalHuerfanos).toBe(1);
    expect(leerCruceSalud(null)).toEqual({ descuadres: [], totalDescuadres: 0, huerfanos: [], totalHuerfanos: 0 });
  });

  it('reconoce la función que aún no existe (la pantalla no muestra cero)', () => {
    expect(esFuncionInexistente({ code: 'PGRST202' })).toBe(true);
    expect(esFuncionInexistente({ code: '42883' })).toBe(true);
    expect(esFuncionInexistente({ code: '42501', message: 'SIN_PERMISO' })).toBe(false);
  });

  it('cuentas agrupadoras con movimiento: solo las que tienen subcuentas y líneas propias', () => {
    const plan = [
      { account_code: '2408', name: 'IVA por pagar' },
      { account_code: '240805', name: 'IVA 19 %' },
      { account_code: '1105', name: 'Caja' },
      { account_code: '110505', name: 'Caja general' },
    ];
    const saldos = new Map([
      ['2408', { saldo: -19000, movimientos: 3 }],
      ['110505', { saldo: 500, movimientos: 9 }],
    ]);
    expect(cuentasAgrupadorasConMovimiento(plan, saldos)).toEqual([{ codigo: '2408', nombre: 'IVA por pagar', movimientos: 3, saldo: -19000, subcuentas: 1 }]);
  });

  it('balance y todo en orden', () => {
    expect(balanceCuadra([{ debito: '100.10', credito: 50 }, { debito: 0, credito: '50.10' }])).toEqual({ cuadra: true, diferencia: 0 });
    expect(balanceCuadra([{ debito: 10, credito: 0 }]).cuadra).toBe(false);
    expect(saludSinProblemas([0, 0, 0])).toBe(true);
    expect(saludSinProblemas([0, null])).toBe(false);
  });
});

describe('mayorLogica', () => {
  const mayor: LedgerAccount = {
    account_code: '130505',
    name: 'Clientes nacionales',
    type: 'asset',
    opening_balance: 8420000,
    entries: [
      { journal_entry_id: 8702, entry_date: '2026-09-02T15:00:00Z', account_code: '130505', memo: 'Venta', source: 'invoice_sales', posted: true, debit: 476000, credit: 0, running_balance: 8896000, description: 'Venta a crédito' },
      { journal_entry_id: 8811, entry_date: '2026-09-05T15:00:00Z', account_code: '130505', memo: 'Cobro FV-0951', source: 'payments', posted: true, debit: 0, credit: 476000, running_balance: 8420000, description: null },
    ],
    total_debit: 476000,
    total_credit: 476000,
    closing_balance: 8420000,
    truncated: false,
  };

  it('arma saldo inicial, movimientos y saldo final', () => {
    const filas = filasMayor(mayor);
    expect(filas.map((f) => f.tipo)).toEqual(['inicial', 'movimiento', 'movimiento', 'final']);
    expect(filas[3]).toMatchObject({ saldo: 8420000, movimientos: 2 });
  });

  it('con filtros no hay fila de saldo inicial', () => {
    expect(filasMayor({ ...mayor, filtrado: true })[0].tipo).toBe('movimiento');
  });

  it('pagina en pantalla', () => {
    expect(paginaDe([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4]);
    expect(paginaDe([1, 2], 0, 25)).toEqual([1, 2]);
  });

  it('saldo con su naturaleza y descripción de la línea', () => {
    expect(saldoMayor(8420000, mayor)).toEqual({ valor: 8420000, lado: 'D' });
    expect(saldoMayor(-100, { account_code: '2408', type: 'liability' })).toEqual({ valor: 100, lado: 'D' });
    expect(descripcionLinea(mayor.entries[1])).toBe('Cobro FV-0951');
    expect(descripcionLinea(mayor.entries[0])).toBe('Venta a crédito');
  });

  it('cuenta de la URL saneada', () => {
    expect(cuentaDeUrl('110505')).toBe('110505');
    expect(cuentaDeUrl('<script>')).toBeNull();
    expect(cuentaDeUrl(null)).toBeNull();
  });
});

describe('inicioContabilidadLogica', () => {
  const p = (month: number, status: 'open' | 'closed') => ({
    id: String(month), year: 2026, month, period_type: 'monthly' as const, start_date: `2026-${String(month).padStart(2, '0')}-01`, end_date: '2026-12-31', status,
  });

  it('periodo actual y meses pasados sin cerrar', () => {
    const r = periodoActual([p(7, 'closed'), p(8, 'open'), p(9, 'open')], '2026-09-28');
    expect(r).toMatchObject({ mes: 9, anio: 2026, estado: 'open', sinCerrar: [8] });
    expect(periodoActual([], '2026-09-28').estado).toBeNull();
  });

  it('nombre del mes sin correr el día', () => {
    expect(nombreMes(9, 2026, 'es')).toBe('Septiembre');
    expect(nombreMes(9, 2026, 'en', true)).toBe('September 2026');
  });

  it('agrupadoras y tono del aviso', () => {
    expect(contarAgrupadoras(['1', '11', '1105', '110505', '2'])).toBe(3);
    expect(tonoAvisoInicio(3, 4)).toBe('peligro');
    expect(tonoAvisoInicio(0, 4)).toBe('advertencia');
    expect(tonoAvisoInicio(null, null)).toBeNull();
  });
});
