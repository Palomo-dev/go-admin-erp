/**
 * L9 (docs/implementacion/POS-PLAN.md §2.1): descuentos frecuentes de un
 * producto = los 3 importes más usados, contando ventas (`sale_items`) y
 * facturas (`invoice_items`). Caracterización de
 * `POSService.getFrequentDiscounts` con filas simuladas.
 *
 * Datos inventados: organización 120, producto 1001.
 */
const mockRespuestas: Record<string, { data: unknown; error: unknown }> = {};
jest.mock('@/lib/supabase/config', () => {
  const tabla = (nombre: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'neq', 'gt', 'gte', 'lte', 'or', 'not']) chain[m] = () => chain;
    const respuesta = () => mockRespuestas[nombre] ?? { data: [], error: null };
    chain.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(respuesta()).then(ok, ko);
    return chain;
  };
  return { supabase: { from: tabla } };
});
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
  getCurrentBranchIdWithFallback: () => 7,
  getCurrentUserId: () => 'user-1',
}));
jest.mock('@/lib/services/promotionEngine', () => ({ promotionEngine: { evaluate: async () => ({ discountTotal: 0, itemDiscounts: {}, applied: [] }) } }));
jest.mock('@/lib/pos/display/posDisplay', () => ({ getPosDisplayEmitter: () => ({ onCartsSaved: () => undefined }) }));

import { POSService } from '@/lib/services/posService';

const filas = (...valores: Array<string | number>) => ({ data: valores.map((v) => ({ discount_amount: v })), error: null });

afterEach(() => {
  delete mockRespuestas.sale_items;
  delete mockRespuestas.invoice_items;
});

describe('descuentos frecuentes (L9)', () => {
  it('los 3 importes más usados sumando ventas y facturas, del más usado al menos', async () => {
    mockRespuestas.sale_items = filas('5000.00', '1000', '5000', '2000', '3000.50');
    mockRespuestas.invoice_items = filas('1000.00', 5000, '0');
    expect(await POSService.getFrequentDiscounts(1001, 120)).toEqual([5000, 1000, 2000]);
  });

  it('con menos de 3 importes devuelve los que hay; sin filas, lista vacía', async () => {
    mockRespuestas.sale_items = filas('2500');
    mockRespuestas.invoice_items = filas();
    expect(await POSService.getFrequentDiscounts(1001, 120)).toEqual([2500]);
    mockRespuestas.sale_items = filas();
    expect(await POSService.getFrequentDiscounts(1001, 120)).toEqual([]);
  });
});
