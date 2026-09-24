/**
 * L10 (docs/implementacion/POS-PLAN.md §2.1): «Espera» con motivo y
 * «Reactivar». Caracterización de `POSService.holdCart` y `activateCart`.
 * (El motivo por defecto «Sin motivo especificado» lo pone CartView al
 * llamar; el servicio guarda lo que recibe.)
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
import { almacen, carrito, guardarCarritos, instalarAlmacen, leerCarritos, linea } from './utilesServicio';

beforeAll(() => instalarAlmacen());
beforeEach(() => {
  almacen.clear();
  guardarCarritos([
    carrito('cart-1', { items: [linea('l1')], total: 20000 }),
    carrito('deuda', { status: 'hold_with_debt', hold_reason: 'fiado' }),
  ]);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('espera y reactivar (L10)', () => {
  it('«Espera» guarda el estado y el motivo; el carrito sigue entre los vivos y conserva sus líneas', async () => {
    const cart = await POSService.holdCart('cart-1', 'Cliente fue al cajero');
    expect(cart).toMatchObject({ status: 'hold', hold_reason: 'Cliente fue al cajero' });
    expect(leerCarritos()[0]).toMatchObject({ status: 'hold', hold_reason: 'Cliente fue al cajero' });
    const vivos = await POSService.getActiveCarts(7);
    expect(vivos.map((c) => c.id)).toEqual(['cart-1']);
    expect(vivos[0].items).toHaveLength(1);
  });

  it('«Reactivar» lo vuelve activo y borra el motivo', async () => {
    await POSService.holdCart('cart-1', 'x');
    const cart = await POSService.activateCart('cart-1');
    expect(cart.status).toBe('active');
    expect(cart.hold_reason).toBeUndefined();
    expect(leerCarritos()[0].status).toBe('active');
  });

  it('«Espera» no alcanza un carrito en deuda; «Reactivar» sí lo busca en la lista completa', async () => {
    await expect(POSService.holdCart('deuda', 'x')).rejects.toThrow('Carrito no encontrado');
    const cart = await POSService.activateCart('deuda');
    expect(cart).toMatchObject({ id: 'deuda', status: 'active' });
  });
});
