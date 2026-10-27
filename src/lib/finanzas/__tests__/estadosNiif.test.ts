import {
  COMPARATIVO_POR_DEFECTO,
  TITULO_RESULTADO_INTEGRAL,
  TITULO_SITUACION_FINANCIERA,
  corteComparativo,
  gastosPorFuncion,
  importesPorCodigo,
  rangoComparativo,
  resultadoIntegral,
} from '@/lib/finanzas/reportes/estadosNiif';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const n = (account_code: string, amount: number, children: ReturnType<typeof n>[] = []) => ({ account_code, amount, children });

describe('estados financieros NIIF Pymes', () => {
  it('nombres y comparativo por defecto (3.14)', () => {
    expect(TITULO_SITUACION_FINANCIERA).toBe('Estado de situación financiera');
    expect(TITULO_RESULTADO_INTEGRAL).toBe('Estado del resultado integral');
    expect(COMPARATIVO_POR_DEFECTO).toBe(true);
    const balance = readFileSync(join(process.cwd(), 'src/components/finanzas/contabilidad/balance-general/BalanceGeneralPage.tsx'), 'utf8');
    expect(balance).not.toMatch(/>Balance General</);
    expect(balance).toContain('TITULO_SITUACION_FINANCIERA');
  });

  it('periodo comparativo', () => {
    expect(rangoComparativo('2024-01-01', '2024-02-29')).toEqual({ desde: '2023-01-01', hasta: '2023-02-28' });
    expect(corteComparativo('2026-10-27')).toBe('2025-12-31');
  });

  it('gastos por función en positivo; un saldo crédito queda negativo y suma al resultado', () => {
    const gastos = [
      n('5', 0, [
        n('51', 1000, [n('5105', 1000)]),
        n('52', 300, [n('5205', 300)]),
        n('53', -50, [n('5305', -50)]),
      ]),
      n('6', 400, [n('61', 400)]),
    ];
    const renglones = gastosPorFuncion(gastos);
    const por = Object.fromEntries(renglones.map((r) => [r.clave, r.importe]));
    expect(por['51']).toBe(1000);
    expect(por['52']).toBe(300);
    expect(por['53']).toBe(-50);
    expect(por.costos).toBe(400);
    expect(resultadoIntegral(2000, renglones)).toBe(350);
  });

  it('importes por código para la columna comparativa', () => {
    const mapa = importesPorCodigo([n('1', 10, [n('11', 10)])]);
    expect(mapa.get('11')).toBe(10);
  });
});
