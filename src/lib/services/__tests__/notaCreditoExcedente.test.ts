/**
 * F-58 · excedente de una nota crédito: el dinero ya pagado que la nota
 * convierte en saldo del cliente. Es la vista previa del diálogo; la regla que
 * manda vive en la base (`fn_excedente_nota_credito`) y estos casos son los
 * mismos que se verificaron allí en la org de prueba 149.
 */

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 900 }));

import { excedenteNotaCredito } from '@/lib/services/notasCreditoService';

describe('excedenteNotaCredito', () => {
  test('factura pagada del todo y nota total: todo el importe es excedente', () => {
    // E2E-A: 1.190.000 pagados, nota por 1.190.000.
    expect(excedenteNotaCredito(1_190_000, 0, 1_190_000)).toBe(1_190_000);
  });

  test('factura pagada y nota parcial: el excedente es la nota', () => {
    // E2E-B: nota de 119.000 sobre una factura pagada.
    expect(excedenteNotaCredito(119_000, 0, 1_190_000)).toBe(119_000);
  });

  test('factura con abono: primero se cancela lo que se debía, el resto es excedente', () => {
    // E2E-E: total 59.500, debía 49.500 (pagó 10.000), nota total.
    expect(excedenteNotaCredito(59_500, 49_500, 59_500)).toBe(10_000);
  });

  test('nota menor o igual a lo que se debía: no hay excedente', () => {
    expect(excedenteNotaCredito(20_000, 49_500, 59_500)).toBe(0);
    expect(excedenteNotaCredito(49_500, 49_500, 59_500)).toBe(0);
  });

  test('factura sin ningún pago: una nota mayor que la factura no crea dinero a devolver', () => {
    // El caso real que motivó la regla: nota de 160.531 sobre una factura de 134.900 sin pagos.
    expect(excedenteNotaCredito(160_531, 134_900, 134_900)).toBe(0);
  });

  test('entradas vacías o negativas no producen excedente negativo ni NaN', () => {
    expect(excedenteNotaCredito(0, 0, 0)).toBe(0);
    expect(excedenteNotaCredito(Number.NaN, 0, 100)).toBe(0);
    expect(excedenteNotaCredito(-500, 0, 100)).toBe(0);
  });

  test('redondea a centavos', () => {
    expect(excedenteNotaCredito(100.005, 0, 200)).toBeCloseTo(100.01, 2);
  });
});
