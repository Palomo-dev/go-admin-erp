/**
 * Checkout atómico por RPC (fase 4E): `POSService.checkout` → `pos_checkout_v1`.
 *
 * Contrato que fijan estos tests:
 *   - Con la RPC disponible, una venta = UNA llamada `rpc('pos_checkout_v1')`
 *     con el sobre completo y valores ya calculados; ningún insert desde el
 *     cliente. El carrito se cierra y la pantalla del cliente recibe la misma
 *     emisión que antes.
 *   - Venta ya existente: la RPC responde `replayed: true` y el checkout
 *     devuelve la venta existente marcada `replayed`.
 *   - RPC ausente (PGRST202): se cae al respaldo de N inserts, con un único
 *     `console.warn` por sesión aunque haya varias ventas.
 *   - Error de la RPC: se propaga con su código; el cliente no escribió nada
 *     (la transacción de Postgres deshace todo) y el carrito sigue abierto.
 *   - `salesSync` reproduce cada sobre del outbox con una sola llamada a la
 *     RPC y lo marca `synced` también cuando ya existía (`replayed`).
 *
 * Datos inventados: organización 120, sucursal 7, usuario `user-cajero`.
 */

import { createFakeSupabase, type FakeHandler, type FakeOp } from './fakeSupabase';

const fake = createFakeSupabase(() => ({ data: null }));

jest.mock('@/lib/supabase/config', () => ({ supabase: fake.client }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
  getCurrentBranchIdWithFallback: () => 7,
  getCurrentUserId: async () => 'user-sync',
}));
jest.mock('@/lib/utils/invoiceUtils', () => ({ generateInvoiceNumber: jest.fn(async () => 'FACT-000001') }));
jest.mock('@/lib/utils/taxCalculations', () => ({
  calculateCartTaxesComplete: jest.fn(),
  getTaxIncludedSetting: jest.fn(),
  formatTaxCalculationForLog: jest.fn(),
}));
jest.mock('@/lib/services/creditNoteNumberService', () => ({ CreditNoteNumberService: {} }));
jest.mock('@/lib/services/stockMovementService', () => ({
  stockMovementService: { decrementOnSale: jest.fn(async () => ({ errors: [], skipped: 0 })) },
}));
jest.mock('@/lib/services/serialTrackingService', () => ({ serialTrackingService: { sellSerials: jest.fn() } }));
jest.mock('@/lib/services/promotionEngine', () => ({
  promotionEngine: {
    evaluate: jest.fn(async () => ({
      discountTotal: 1000,
      itemDiscounts: { 1001: 1000 },
      applied: [{ promotion_id: 'promo-1', items_affected: [1001] }],
    })),
  },
}));
const emitter = { onCartsSaved: jest.fn(), setMode: jest.fn() };
jest.mock('@/lib/pos/display/posDisplay', () => ({ getPosDisplayEmitter: () => emitter }));
jest.mock('@/lib/utils/offlineCache', () => ({ isAppOnline: jest.fn(() => true) }));
jest.mock('../customersSync', () => ({
  ensureCustomerSynced: jest.fn(async () => ({ kind: 'not_in_outbox' })),
  syncPendingCustomers: jest.fn(async () => ({ synced: 0, failed: 0, needsReview: 0, skipped: 0 })),
}));

jest.spyOn(console, 'log').mockImplementation(() => {});
const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

import { installWindow, uninstallWindow, freshIndexedDb } from './testEnv';
import { isAppOnline } from '@/lib/utils/offlineCache';
import { stockMovementService } from '@/lib/services/stockMovementService';
import { generateInvoiceNumber } from '@/lib/utils/invoiceUtils';
import { POSService } from '@/lib/services/posService';
import type { CheckoutData } from '@/components/pos/types';
import { __resetOutboxForTests, enqueueOfflineSale, getOutboxSale } from '../salesOutbox';
import { __resetSalesSyncForTests, syncPendingSales } from '../salesSync';
import {
  __resetCheckoutRpcForTests,
  POS_CHECKOUT_RPC,
  buildCheckoutEnvelope,
  isCheckoutRpcAvailable,
  isRpcMissingError,
  type CheckoutEnvelope,
} from '../checkoutRpc';

const isAppOnlineMock = isAppOnline as jest.Mock;
const SALE_ID = '22222222-2222-4222-8222-222222222222';
const CREATED_AT = '2026-09-16T14:30:00.000Z';
const RPC_TABLE = `rpc:${POS_CHECKOUT_RPC}`;

function makeCheckout(overrides: Partial<CheckoutData> = {}): CheckoutData {
  return {
    cart: {
      id: 'cart-77',
      organization_id: 120,
      branch_id: 7,
      customer_id: 'cust-9',
      status: 'active',
      items: [
        { id: 'i1', product_id: 1001, quantity: 2, unit_price: 5000, total: 10000, tax_rate: 19, product: { id: 1001, name: 'A' }, modifiers: [{ groupId: 1, groupName: 'Extra', modifierId: 5, name: 'Queso', extraPrice: 0 }] } as never,
        { id: 'i2', product_id: 1002, quantity: 1, unit_price: 3000, total: 3000, tax_rate: 0, product: { id: 1002, name: 'B' } } as never,
      ],
      subtotal: 13000,
      tax_amount: 0,
      tax_total: 0,
      discount_amount: 0,
      discount_total: 0,
      total: 12000,
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
      tax_included: true,
    },
    payments: [
      { method: 'cash', amount: 10000 },
      { method: 'card', amount: 3000 },
    ],
    change: 500,
    total_paid: 13000,
    tax_included: true,
    tip_amount: 500,
    tip_server_id: 'mesero-1',
    serial_selections: { 1002: [501] },
    ...overrides,
  };
}

/** Respuesta de la RPC para una venta nueva. */
function rpcOk(envelope: CheckoutEnvelope, replayed = false) {
  return {
    data: {
      sale: {
        id: envelope.sale_id,
        organization_id: envelope.organization_id,
        branch_id: envelope.branch_id,
        user_id: envelope.user_id ?? 'user-sync',
        total: envelope.totals.total,
        balance: 0,
        status: 'paid',
        payment_status: 'paid',
        sale_date: envelope.created_at,
        created_at: envelope.created_at,
      },
      invoice: { id: 'inv-1', number: 'FACT-0001', sale_id: envelope.sale_id },
      payments: [{ id: 'p1' }, { id: 'p2' }],
      replayed,
      completed: replayed ? ['payments'] : [],
      warnings: [],
    },
  };
}

function rpcHandler(onRpc: (envelope: CheckoutEnvelope, op: FakeOp) => ReturnType<FakeHandler>): FakeHandler {
  return (op) => {
    if (op.table === RPC_TABLE) {
      const args = op.payload as { p_envelope: CheckoutEnvelope };
      return onRpc(args.p_envelope, op);
    }
    if (op.table === 'rpc:get_organization_currencies') return { data: [{ code: 'COP', is_base: true }] };
    if (op.action === 'insert' || op.action === 'update') {
      throw new Error(`Con la RPC disponible no debía escribir en ${op.table}`);
    }
    return { data: null };
  };
}

function seedCarts() {
  localStorage.setItem(
    'pos_carts_120',
    JSON.stringify([
      { id: 'cart-77', status: 'active', items: [] },
      { id: 'cart-78', status: 'active', items: [] },
    ]),
  );
}

function rpcCalls(): FakeOp[] {
  return fake.ops.filter((o) => o.table === RPC_TABLE);
}

describe('checkout atómico por RPC (pos_checkout_v1)', () => {
  beforeEach(() => {
    freshIndexedDb();
    __resetOutboxForTests();
    __resetCheckoutRpcForTests();
    __resetSalesSyncForTests();
    fake.reset();
    isAppOnlineMock.mockReturnValue(true);
    (stockMovementService.decrementOnSale as jest.Mock).mockClear();
    (generateInvoiceNumber as jest.Mock).mockClear();
    emitter.onCartsSaved.mockClear();
    warnSpy.mockClear();
  });

  afterEach(() => {
    __resetOutboxForTests();
    __resetSalesSyncForTests();
    uninstallWindow();
  });

  test('una venta = una sola llamada a la RPC con el sobre completo; ningún insert desde el cliente', async () => {
    installWindow({ desktop: true });
    seedCarts();
    let received: CheckoutEnvelope | null = null;
    fake.setHandler(rpcHandler((envelope) => {
      received = envelope;
      return rpcOk(envelope);
    }));

    const sale = await POSService.checkout(makeCheckout({ saleId: SALE_ID, createdAt: CREATED_AT, userId: 'user-cajero' }));

    expect(rpcCalls()).toHaveLength(1);
    expect(fake.ops.filter((o) => o.action === 'insert' || o.action === 'update')).toHaveLength(0);
    // Ni stock ni consecutivo desde el cliente: los hace la RPC.
    expect(stockMovementService.decrementOnSale).not.toHaveBeenCalled();
    expect(generateInvoiceNumber).not.toHaveBeenCalled();
    // Ni la RPC de promociones: va dentro del sobre.
    expect(fake.ops.filter((o) => o.table === 'rpc:increment_promotion_usage')).toHaveLength(0);

    const env = received as unknown as CheckoutEnvelope;
    expect(env.version).toBe(1);
    expect(env.sale_id).toBe(SALE_ID);
    expect(env.created_at).toBe(CREATED_AT);
    expect(env.organization_id).toBe(120);
    expect(env.branch_id).toBe(7);
    expect(env.user_id).toBe('user-cajero');
    expect(env.customer_id).toBe('cust-9');
    expect(env.currency).toBe('COP');
    expect(env.tax_included).toBe(true);
    // Promoción aplicada en el checkout: descuento en el ítem y id en el sobre.
    expect(env.promotion_ids).toEqual(['promo-1']);
    expect(env.items).toHaveLength(2);
    expect(env.items[0]).toMatchObject({ product_id: 1001, product_name: 'A', quantity: 2, unit_price: 5000, discount_amount: 1000, tax_rate: 19, tax_included: true, serial_ids: [] });
    expect(env.items[0].modifiers).toEqual([{ name: 'Queso' }]);
    expect(env.items[1]).toMatchObject({ product_id: 1002, quantity: 1, unit_price: 3000, tax_rate: 0, serial_ids: [501] });
    // Totales calculados en el cliente: 9000 (10000-1000, IVA incluido) + 3000 + propina 500.
    expect(env.totals.total).toBe(12500);
    expect(env.totals.tip_amount).toBe(500);
    expect(env.totals.total_paid).toBe(13000);
    expect(env.totals.change).toBe(500);
    expect(env.payments).toEqual([
      { method: 'cash', amount: 10000 },
      { method: 'card', amount: 3000 },
    ]);
    expect(env.tip).toEqual({ server_id: 'mesero-1' });
    expect(env.salesperson).toBeNull();
    expect(env.invoice).toEqual({ prefix: 'FACT', commission_amount: 0 });

    expect(sale.id).toBe(SALE_ID);
    expect(sale.replayed).toBe(false);
    expect(isCheckoutRpcAvailable()).toBe(true);

    // Carrito cerrado igual que antes (y la pantalla del cliente lo ve).
    const carts = JSON.parse(localStorage.getItem('pos_carts_120') || '[]') as Array<{ id: string }>;
    expect(carts.map((c) => c.id)).toEqual(['cart-78']);
    expect(emitter.onCartsSaved).toHaveBeenCalledTimes(1);
  });

  test('navegador sin saleId: el cliente genera el id para que la RPC sea idempotente también ahí', async () => {
    installWindow({ desktop: false });
    seedCarts();
    let received: CheckoutEnvelope | null = null;
    fake.setHandler(rpcHandler((envelope) => {
      received = envelope;
      return rpcOk(envelope);
    }));

    const sale = await POSService.checkout(makeCheckout());

    const env = received as unknown as CheckoutEnvelope;
    expect(env.sale_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(env.user_id).toBeNull(); // la RPC usa auth.uid()
    expect(sale.id).toBe(env.sale_id);
    expect(rpcCalls()).toHaveLength(1);
  });

  test('venta ya existente: la RPC responde replayed y no se repite nada', async () => {
    installWindow({ desktop: true });
    seedCarts();
    fake.setHandler(rpcHandler((envelope) => rpcOk(envelope, true)));

    const sale = await POSService.checkout(makeCheckout({ saleId: SALE_ID, createdAt: CREATED_AT, replayFromOutbox: true }));

    expect(rpcCalls()).toHaveLength(1);
    expect(sale.id).toBe(SALE_ID);
    expect(sale.replayed).toBe(true);
    expect(fake.ops.filter((o) => o.action === 'insert' || o.action === 'update')).toHaveLength(0);
  });

  test('RPC ausente (PGRST202): la venta falla visible, sin N inserts y con un único aviso por sesión', async () => {
    installWindow({ desktop: true });
    seedCarts();
    fake.setHandler((op) => {
      if (op.table === RPC_TABLE) {
        return { error: { code: 'PGRST202', message: `Could not find the function public.${POS_CHECKOUT_RPC}(p_envelope) in the schema cache` } };
      }
      return { data: null };
    });

    await expect(POSService.checkout(makeCheckout({ saleId: SALE_ID, createdAt: CREATED_AT }))).rejects.toThrow(/servicio de cobro no está disponible/);
    expect(isCheckoutRpcAvailable()).toBe(false);
    expect(fake.ops.filter((o) => o.action === 'insert' || o.action === 'update')).toHaveLength(0);
    expect(generateInvoiceNumber).not.toHaveBeenCalled();

    // Segunda venta en la misma sesión: tampoco se degrada a N inserts.
    seedCarts();
    fake.reset();
    await expect(POSService.checkout(makeCheckout({ saleId: '33333333-3333-4333-8333-333333333333' }))).rejects.toThrow(/La venta NO se guardó/);
    expect(fake.ops.filter((o) => o.action === 'insert' || o.action === 'update')).toHaveLength(0);
    expect(warnSpy.mock.calls.filter((c) => String(c[0]).includes('pos_checkout_v1 no existe'))).toHaveLength(1);
  });

  test('error de la RPC: se propaga con su código, nada escrito y el carrito sigue abierto', async () => {
    installWindow({ desktop: true });
    seedCarts();
    fake.setHandler(rpcHandler(() => ({
      error: { code: '22023', message: 'Totales incoherentes: ítems 12000 + flete 0 + propina 500 ≠ total 99' },
    })));

    await expect(POSService.checkout(makeCheckout({ saleId: SALE_ID }))).rejects.toMatchObject({
      name: 'CheckoutRpcError',
      code: '22023',
      message: expect.stringContaining('Totales incoherentes'),
    });

    expect(rpcCalls()).toHaveLength(1);
    expect(fake.ops.filter((o) => o.action === 'insert' || o.action === 'update')).toHaveLength(0);
    // No se cayó al respaldo: la RPC existe, solo rechazó el sobre.
    expect(isCheckoutRpcAvailable()).not.toBe(false);
    const carts = JSON.parse(localStorage.getItem('pos_carts_120') || '[]') as Array<{ id: string }>;
    expect(carts.map((c) => c.id)).toEqual(['cart-77', 'cart-78']);
    expect(emitter.onCartsSaved).not.toHaveBeenCalled();
  });

  test('cobro de deuda (cart.sale_id + invoice_id): no pasa por la RPC, sigue el camino de siempre', async () => {
    installWindow({ desktop: true });
    seedCarts();
    fake.setHandler((op) => {
      if (op.table === RPC_TABLE) throw new Error('El cobro de deuda no debe ir por la RPC');
      if (op.action === 'update') return { data: { id: op.filters.id, balance: 0, total: 12500, number: 'FACT-0009' } };
      if (op.action === 'insert') {
        const row = op.payload as Record<string, unknown>;
        return { data: { id: `${op.table}-new`, ...row } };
      }
      return { data: null };
    });
    const data = makeCheckout({ saleId: SALE_ID });
    data.cart.sale_id = 'venta-deuda';
    data.cart.invoice_id = 'factura-deuda';

    const sale = await POSService.checkout(data);

    expect(rpcCalls()).toHaveLength(0);
    expect(sale.id).toBe('venta-deuda');
    expect(fake.ops.filter((o) => o.table === 'sales' && o.action === 'update')).toHaveLength(1);
  });

  test('salesSync reproduce cada sobre con UNA llamada a la RPC y marca synced también si ya existía', async () => {
    installWindow({ desktop: true });
    isAppOnlineMock.mockReturnValue(false);
    // Dos ventas sin red → outbox.
    await enqueueOfflineSale(makeCheckout({ saleId: SALE_ID, createdAt: CREATED_AT }), { organizationId: 120, branchId: 7, userId: 'user-cajero' });
    const SECOND = '44444444-4444-4444-8444-444444444444';
    await enqueueOfflineSale(makeCheckout({ saleId: SECOND, createdAt: '2026-09-16T14:31:00.000Z' }), { organizationId: 120, branchId: 7, userId: 'user-cajero' });

    // Vuelve la red: la primera ya estaba en Supabase (replayed), la segunda es nueva.
    isAppOnlineMock.mockReturnValue(true);
    const seen: string[] = [];
    fake.setHandler(rpcHandler((envelope) => {
      seen.push(envelope.sale_id);
      return rpcOk(envelope, envelope.sale_id === SALE_ID);
    }));

    const result = await syncPendingSales({ force: true });

    expect(result).toMatchObject({ synced: 2, failed: 0, needsReview: 0 });
    expect(seen).toEqual([SALE_ID, SECOND]);
    expect(rpcCalls()).toHaveLength(2);
    expect(fake.ops.filter((o) => o.action === 'insert' || o.action === 'update')).toHaveLength(0);
    expect((await getOutboxSale(SALE_ID))!.status).toBe('synced');
    expect((await getOutboxSale(SECOND))!.status).toBe('synced');
    // El sobre reproducido conserva el usuario y la fecha originales.
    const env = (rpcCalls()[1].payload as { p_envelope: CheckoutEnvelope }).p_envelope;
    expect(env.user_id).toBe('user-cajero');
    expect(env.created_at).toBe('2026-09-16T14:31:00.000Z');
  });

  test('salesSync: la RPC rechaza el sobre → el sobre queda pending con el error y sin duplicar nada', async () => {
    installWindow({ desktop: true });
    isAppOnlineMock.mockReturnValue(false);
    await enqueueOfflineSale(makeCheckout({ saleId: SALE_ID, createdAt: CREATED_AT }), { organizationId: 120, branchId: 7, userId: 'user-cajero' });
    isAppOnlineMock.mockReturnValue(true);
    fake.setHandler(rpcHandler(() => ({ error: { code: '42501', message: 'No perteneces a esta organización' } })));

    const result = await syncPendingSales({ force: true });

    expect(result).toMatchObject({ synced: 0, failed: 1 });
    const record = await getOutboxSale(SALE_ID);
    expect(record!.status).toBe('pending');
    expect(record!.attempts).toBe(1);
    expect(record!.last_error).toContain('42501');
    expect(record!.last_error).toContain('No perteneces');
    expect(fake.ops.filter((o) => o.action === 'insert' || o.action === 'update')).toHaveLength(0);
  });
});

describe('checkoutRpc — utilidades', () => {
  test('isRpcMissingError reconoce PGRST202 y el mensaje de PostgREST', () => {
    expect(isRpcMissingError({ code: 'PGRST202', message: 'x' })).toBe(true);
    expect(isRpcMissingError({ message: 'Could not find the function public.pos_checkout_v1(p_envelope) in the schema cache' })).toBe(true);
    expect(isRpcMissingError({ code: '42501', message: 'No perteneces a esta organización' })).toBe(false);
    expect(isRpcMissingError(null)).toBe(false);
  });

  test('buildCheckoutEnvelope: pagos en 0 fuera, propina null si no hay, vendedor solo con comisión > 0', () => {
    const checkout = makeCheckout({
      payments: [{ method: 'cash', amount: 0 }, { method: 'transfer', amount: 12500 }],
      total_paid: 12500,
      change: 0,
      tip_amount: 0,
      salesperson_id: 'vend-1',
      commission_rate: 10,
      commission_type: 'salesperson',
      commission_method: 'percentage',
      commission_amount: 900,
    });
    const env = buildCheckoutEnvelope({
      checkout,
      saleId: SALE_ID,
      createdAt: CREATED_AT,
      organizationId: 120,
      branchId: 7,
      userId: null,
      currency: 'COP',
      itemCalcs: [
        { lineNet: 9000, taxRate: 19, taxAmount: 1436.97, total: 9000, taxIncluded: true, discount: 1000 },
        { lineNet: 3000, taxRate: 0, taxAmount: 0, total: 3000, taxIncluded: true, discount: 0 },
      ],
      subtotal: 10563.03,
      taxTotal: 1436.97,
      discountTotal: 1000,
      total: 12000,
      promotionIds: [],
      invoiceCommissionAmount: 1056.3,
    });
    expect(env.payments).toEqual([{ method: 'transfer', amount: 12500 }]);
    expect(env.tip).toBeNull();
    expect(env.salesperson).toEqual({
      id: 'vend-1',
      commission_rate: 10,
      commission_type: 'salesperson',
      commission_method: 'percentage',
      commission_amount: 900,
      base_amount: 13000,
    });
    expect(env.invoice.commission_amount).toBe(1056.3);
    expect(env.items[0].notes).toEqual({ product_name: 'A', modifiers: checkout.cart.items[0].modifiers });
  });
});
