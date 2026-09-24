/**
 * L11 (docs/implementacion/POS-PLAN.md §2.1): las pestañas muestran los
 * carritos `active` y `hold` DE LA SUCURSAL. Los `hold_with_debt` siguen en
 * `pos_carts_<org>` (factura, devoluciones) pero DESAPARECEN de las pestañas
 * al recargar (BE9); `completed` y `cancelled`, igual. El filtro por sucursal
 * lo fija `src/__tests__/pos/carritosPorSucursal.test.ts`; que las mutaciones
 * no borren los de deuda, `notaLineaPersistida.test.ts` y `removeCart.test.ts`.
 *
 * Datos inventados: organización 120, sucursal 7.
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
import { inicializarCarritos } from '@/lib/pos/venta/carritos';
import { almacen, carrito, guardarCarritos, instalarAlmacen, leerCarritos } from './utilesServicio';

beforeAll(() => instalarAlmacen());
beforeEach(() => almacen.clear());

describe('carritos visibles en las pestañas (L11)', () => {
  it('solo activos y en espera; deuda, cobrados y anulados no salen aunque sigan guardados', async () => {
    guardarCarritos([
      carrito('activo'),
      carrito('deuda', { status: 'hold_with_debt' }),
      carrito('espera', { status: 'hold' }),
      carrito('cobrado', { status: 'completed' }),
      carrito('anulado', { status: 'cancelled' }),
    ]);
    expect((await POSService.getActiveCarts(7)).map((c) => c.id)).toEqual(['activo', 'espera']);
    expect(leerCarritos()).toHaveLength(5);
  });

  it('al recargar con solo un carrito en deuda, la pantalla crea uno nuevo y el de deuda sigue guardado', async () => {
    guardarCarritos([carrito('deuda', { status: 'hold_with_debt' })]);
    const crearCarrito = jest.fn(async () => undefined);
    const mostrar = jest.fn();
    await inicializarCarritos({
      servicio: POSService,
      branchId: 7,
      cerrojo: { current: false },
      empezar: () => undefined,
      terminar: () => undefined,
      mostrar,
      crearCarrito,
    });
    expect(mostrar).not.toHaveBeenCalled();
    expect(crearCarrito).toHaveBeenCalledTimes(1);
    expect(leerCarritos().map((c) => c.id)).toEqual(['deuda']);
  });
});
