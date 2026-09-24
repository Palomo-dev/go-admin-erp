// ============================================================================
// L8 · Plan de cuotas de una cuenta por pagar.
//
// Reparto a centavos con la última cuota absorbiendo la diferencia; vencimientos
// por mes calendario recortados al último día del mes; `ap_installments.due_date`
// es `date` (día calendario, sin zona).
//
// «HOY» fija el defecto del servicio viejo: la última cuota no se redondeaba.
// ============================================================================

jest.mock('@/lib/services/timezoneResolver', () => ({ resolveTimezone: async () => 'America/Bogota' }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
  getCurrentUserId: async () => 'u-1',
}));

import { DobleCompras } from './dobleCompras';

let doble = new DobleCompras();
jest.mock('@/lib/supabase/config', () => ({
  get supabase() {
    return doble;
  },
}));

import { planCuotas } from '@/lib/services/compras/logica';
import { CuentaPorPagarDetailService } from '@/components/finanzas/cuentas-por-pagar/id/service';

describe('planCuotas (regla nueva)', () => {
  test('3 cuotas de 100 = 33,33 · 33,33 · 33,34', () => {
    expect(planCuotas(100, 3, '2026-01-31').map((c) => c.valor)).toEqual([33.33, 33.33, 33.34]);
  });

  test('31-ene + 1 mes = último día de febrero (bisiesto y no bisiesto)', () => {
    expect(planCuotas(90, 3, '2026-01-31').map((c) => c.vence)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(planCuotas(90, 2, '2028-01-31').map((c) => c.vence)).toEqual(['2028-01-31', '2028-02-29']);
  });

  test('interés simple por cuota sobre su capital', () => {
    const p = planCuotas(1000, 2, '2026-09-24', 2);
    expect(p).toEqual([
      { numero: 1, vence: '2026-09-24', capital: 500, interes: 10, valor: 510 },
      { numero: 2, vence: '2026-10-24', capital: 500, interes: 10, valor: 510 },
    ]);
  });

  test('la suma de capitales es el total exacto', () => {
    const p = planCuotas(1000.01, 7, '2026-09-24');
    expect(Math.round(p.reduce((s, c) => s + c.capital * 100, 0))).toBe(100001);
  });
});

describe('HOY: crearCuotas del detalle de CxP', () => {
  test('HOY (bug): la última cuota de 100/3 no se redondea', async () => {
    doble = new DobleCompras();
    await CuentaPorPagarDetailService.crearCuotas('cxp-1', 100, 3, new Date('2026-01-31T17:00:00Z'), 120, 7);
    const filas = doble.escrituras('ap_installments', 'insert')[0].payload as Array<{ amount: number; due_date: string }>;
    expect(filas.map((f) => f.due_date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(filas[0].amount).toBe(33.33);
    expect(filas[2].amount).not.toBe(33.34);
    expect(filas[2].amount).toBeCloseTo(33.3333, 3);
  });
});
