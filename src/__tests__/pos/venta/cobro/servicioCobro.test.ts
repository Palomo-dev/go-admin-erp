/**
 * L53 y L42 (POS-PLAN §2.6) contra `POSService` con Supabase simulado.
 *
 * - L53: si `pos_checkout_v1` rechaza el cobro (precio, descuento, línea…) o
 *   la llamada se cae, el cobro falla con error y el carrito NO se borra: la
 *   cajera puede corregir y reintentar con el mismo intento (el diálogo solo
 *   cierra el carrito cuando la venta volvió; `handleCloseReceipt`).
 * - L42: los medios de pago del cobro son los de la organización
 *   (`organization_payment_methods` activos), con el código como id; si la
 *   consulta falla, efectivo y tarjeta.
 *
 * El caso «la RPC no existe» (PGRST202) y el Desktop sin red ya los cubre
 * `src/lib/offline/__tests__/checkoutIdempotente.test.ts`; el reintento con el
 * mismo id, `intentoCobroDialogo.test.ts`.
 *
 * Datos inventados: organización 120, sucursal 7.
 */

import { createFakeSupabase } from '@/lib/offline/__tests__/fakeSupabase';

const fake = createFakeSupabase(() => ({ data: null }));

jest.mock('@/lib/supabase/config', () => ({ supabase: fake.client }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
  getCurrentBranchIdWithFallback: () => 7,
  getCurrentUserId: async () => 'user-cajero',
}));
jest.mock('@/lib/services/promotionEngine', () => ({
  promotionEngine: { evaluate: jest.fn(async () => ({ discountTotal: 0, itemDiscounts: {}, applied: [] })) },
}));
jest.mock('@/lib/pos/display/posDisplay', () => ({ getPosDisplayEmitter: () => ({ onCartsSaved: jest.fn(), setMode: jest.fn() }) }));
jest.mock('@/lib/utils/offlineCache', () => ({ isAppOnline: jest.fn(() => true) }));

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

import { installWindow, uninstallWindow } from '@/lib/offline/__tests__/testEnv';
import { POSService } from '@/lib/services/posService';
import type { CheckoutData } from '@/components/pos/types';
import { __resetCheckoutRpcForTests, CheckoutRpcError, POS_CHECKOUT_RPC } from '@/lib/offline/checkoutRpc';

const INTENTO = '55555555-5555-4555-8555-555555555555';
const CREADO = '2026-09-24T16:00:00.000Z';

function checkout(): CheckoutData {
  return {
    cart: {
      id: 'cart-1', organization_id: 120, branch_id: 7, status: 'active',
      items: [{ id: 'l1', product_id: 1001, quantity: 1, unit_price: 10000, total: 10000, tax_rate: 0, discount_amount: 0, product: { id: 1001, name: 'A' } } as never],
      subtotal: 10000, tax_amount: 0, tax_total: 0, discount_amount: 0, discount_total: 0, total: 10000,
      created_at: CREADO, updated_at: CREADO,
    },
    payments: [{ method: 'cash', amount: 10000 }],
    change: 0,
    total_paid: 10000,
    saleId: INTENTO,
    createdAt: CREADO,
    attemptId: INTENTO,
  };
}

function carritosGuardados(): string[] {
  return (JSON.parse(localStorage.getItem('pos_carts_120') || '[]') as Array<{ id: string }>).map((c) => c.id);
}

describe('L53 · si el cobro falla, el carrito no se borra', () => {
  beforeEach(() => {
    installWindow({ desktop: false });
    __resetCheckoutRpcForTests();
    fake.reset();
    localStorage.setItem('pos_carts_120', JSON.stringify([{ id: 'cart-1', status: 'active', items: [] }, { id: 'cart-2', status: 'active', items: [] }]));
  });
  afterEach(() => uninstallWindow());

  it('la RPC rechaza el cobro (precio inválido): error con su código y los dos carritos siguen', async () => {
    fake.setHandler((op) => {
      if (op.table === `rpc:${POS_CHECKOUT_RPC}`) {
        return { error: { code: 'P0001', message: 'POS_PRECIO_INVALIDO: el precio de la línea no coincide' } };
      }
      return { data: null };
    });
    const intento = POSService.checkout(checkout());
    await expect(intento).rejects.toBeInstanceOf(CheckoutRpcError);
    await expect(intento).rejects.toMatchObject({ code: 'P0001' });
    expect(carritosGuardados()).toEqual(['cart-1', 'cart-2']);
    expect(fake.ops.filter((o) => o.action === 'insert' || o.action === 'update' || o.action === 'delete')).toHaveLength(0);
  });

  it('la llamada se cae (red): el error sube tal cual y el carrito sigue para reintentar', async () => {
    fake.setHandler((op) => {
      if (op.table === `rpc:${POS_CHECKOUT_RPC}`) throw new Error('Failed to fetch');
      return { data: null };
    });
    await expect(POSService.checkout(checkout())).rejects.toThrow('Failed to fetch');
    expect(carritosGuardados()).toEqual(['cart-1', 'cart-2']);
  });
});

describe('L42 · medios de pago de la organización', () => {
  beforeEach(() => {
    installWindow({ desktop: false });
    fake.reset();
  });
  afterEach(() => uninstallWindow());

  it('solo los activos de la organización, con el código como id y el nombre del catálogo', async () => {
    fake.setHandler((op) => {
      if (op.table === 'organization_payment_methods') {
        return {
          data: [
            { payment_method_code: 'cash', is_active: true, settings: null, payment_methods: { name: 'Efectivo' } },
            { payment_method_code: 'breb_qr', is_active: true, settings: { color: 'teal' }, payment_methods: { name: 'Bre-B QR' } },
          ],
        };
      }
      return { data: null };
    });
    const medios = await POSService.getPaymentMethods();
    const consulta = fake.ops.find((o) => o.table === 'organization_payment_methods');
    expect(consulta?.filters).toEqual({ organization_id: 120, is_active: true });
    expect(medios.map((m) => ({ id: m.id, code: m.code, name: m.name, type: m.type }))).toEqual([
      { id: 'cash', code: 'cash', name: 'Efectivo', type: 'cash' },
      { id: 'breb_qr', code: 'breb_qr', name: 'Bre-B QR', type: 'digital' },
    ]);
    expect(medios[1].color).toBe('teal');
  });

  it('si la consulta falla, el cobro sigue con efectivo y tarjeta', async () => {
    fake.setHandler((op) => (op.table === 'organization_payment_methods' ? { error: { message: 'timeout' } } : { data: null }));
    const medios = await POSService.getPaymentMethods();
    expect(medios.map((m) => m.code)).toEqual(['cash', 'card']);
  });
});
