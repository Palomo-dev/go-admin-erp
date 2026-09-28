// ============================================================================
// L9 · Antigüedad de una cuenta por pagar por días de mora, con el día de la
// organización.
//
// Hoy el detalle de CxP usa 4 tramos (`getAgingInfo`) y cuenta los días contra
// el inicio del día de la organización. El listado nuevo usa los 5 tramos
// compartidos con CxC (`tramoAntiguedad`, `src/lib/finanzas/cartera`), que
// viven con la sesión de cartera; aquí se fijan las fronteras del detalle.
// Correr también con `npm run test:tz-all`: el resultado no depende del TZ
// del proceso.
// ============================================================================

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

import { CuentaPorPagarDetailService } from '@/components/finanzas/cuentas-por-pagar/id/service';

describe('getAgingInfo (hoy, 4 tramos)', () => {
  test.each([
    [0, 'Al día'],
    [1, '1-30 días'],
    [30, '1-30 días'],
    [31, '31-60 días'],
    [60, '31-60 días'],
    [61, 'Más de 60 días'],
    [90, 'Más de 60 días'],
    [91, 'Más de 60 días'],
  ])('%p días → %p', (dias, tramo) => {
    expect(CuentaPorPagarDetailService.getAgingInfo(dias).period).toBe(tramo);
  });
});

describe('días de mora con el día de la organización', () => {
  const HOY = new Date('2026-09-24T15:00:00Z'); // 10:00 en Bogotá

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(HOY);
  });
  afterAll(() => jest.useRealTimers());

  const conVencimiento = (due: string) =>
    new DobleCompras({
      accounts_payable: [
        {
          data: {
            id: 'c', organization_id: 120, supplier_id: 3, invoice_id: null, amount: 100, balance: 100,
            due_date: due, status: 'pending', suppliers: null, invoice_purchase: null,
          },
          error: null,
        },
      ],
    });

  test('vence ayer a medianoche de Bogotá → 1 día de mora', async () => {
    doble = conVencimiento('2026-09-23T05:00:00Z');
    const d = await CuentaPorPagarDetailService.obtenerDetalleCuentaPorPagar('c', 'America/Bogota');
    expect(d?.days_overdue).toBe(1);
  });

  test('vence hoy en Bogotá → al día', async () => {
    doble = conVencimiento('2026-09-24T05:00:00Z');
    const d = await CuentaPorPagarDetailService.obtenerDetalleCuentaPorPagar('c', 'America/Bogota');
    expect(d?.days_overdue).toBe(0);
  });

  test('vence hace 31 días → 31', async () => {
    doble = conVencimiento('2026-08-24T05:00:00Z');
    const d = await CuentaPorPagarDetailService.obtenerDetalleCuentaPorPagar('c', 'America/Bogota');
    expect(d?.days_overdue).toBe(31);
  });
});
