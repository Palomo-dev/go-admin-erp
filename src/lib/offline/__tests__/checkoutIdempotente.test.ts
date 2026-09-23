/**
 * `POSService.checkout` sin la RPC `pos_checkout_v1` y sin red.
 *
 * Contrato que fijan estos tests:
 *   - Desktop sin red: no se emite ninguna operación a Supabase; el sobre va
 *     al outbox, el carrito se cierra y la venta provisional lleva el número
 *     local que el ticket imprime como «Pendiente de sincronizar».
 *   - Con red, una venta nueva SOLO se guarda por la RPC. Si la RPC no existe
 *     (PGRST202), la venta falla con un error visible, no escribe nada y el
 *     carrito sigue abierto: ya no hay respaldo de N inserts en transacciones
 *     separadas (F-48, ADR-CC-002). La idempotencia por id de cliente la da la
 *     RPC (`replayed`) y se prueba en `checkoutRpc.test.ts`.
 *
 * Datos inventados: organización 120, sucursal 7, usuario `user-cajero`.
 */

import { createFakeSupabase, type FakeOp, type FakeResult } from './fakeSupabase';

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
  promotionEngine: { evaluate: jest.fn(async () => ({ discountTotal: 0, itemDiscounts: {}, applied: [] })) },
}));
const emitter = { onCartsSaved: jest.fn(), setMode: jest.fn() };
jest.mock('@/lib/pos/display/posDisplay', () => ({ getPosDisplayEmitter: () => emitter }));
jest.mock('@/lib/utils/offlineCache', () => ({ isAppOnline: jest.fn(() => true) }));

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

import { installWindow, uninstallWindow, freshIndexedDb } from './testEnv';
import { isAppOnline } from '@/lib/utils/offlineCache';
import { stockMovementService } from '@/lib/services/stockMovementService';
import { POSService } from '@/lib/services/posService';
import type { CheckoutData } from '@/components/pos/types';
import { __resetOutboxForTests, getOutboxSale, listOutboxSales, ticketSaleNumber } from '../salesOutbox';
import { __resetCheckoutRpcForTests, POS_CHECKOUT_RPC } from '../checkoutRpc';

const isAppOnlineMock = isAppOnline as jest.Mock;
const SALE_ID = '22222222-2222-4222-8222-222222222222';
const CREATED_AT = '2026-09-16T14:30:00.000Z';

function makeCheckout(overrides: Partial<CheckoutData> = {}): CheckoutData {
  return {
    cart: {
      id: 'cart-77',
      organization_id: 120,
      branch_id: 7,
      customer_id: undefined,
      status: 'active',
      items: [
        { id: 'i1', product_id: 1001, quantity: 2, unit_price: 5000, total: 10000, tax_rate: 19, product: { id: 1001, name: 'A' } } as never,
        { id: 'i2', product_id: 1002, quantity: 1, unit_price: 3000, total: 3000, tax_rate: 0, product: { id: 1002, name: 'B' } } as never,
      ],
      subtotal: 13000,
      tax_amount: 0,
      tax_total: 0,
      discount_amount: 0,
      discount_total: 0,
      total: 13000,
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
      tax_included: true,
    },
    payments: [
      { method: 'cash', amount: 10000 },
      { method: 'card', amount: 3000 },
    ],
    change: 0,
    total_paid: 13000,
    tax_included: true,
    tip_amount: 500,
    ...overrides,
  };
}

/** La RPC atómica no existe en este entorno: PostgREST responde PGRST202. */
const RPC_MISSING: FakeResult = { error: { code: 'PGRST202', message: `Could not find the function public.${POS_CHECKOUT_RPC}(p_envelope) in the schema cache` } };

/** Respuesta "todo nuevo": nada existe, cada insert devuelve su fila. */
function freshDbHandler(op: FakeOp) {
  if (op.table === `rpc:${POS_CHECKOUT_RPC}`) return RPC_MISSING;
  if (op.action === 'insert') {
    const row = Array.isArray(op.payload) ? op.payload[0] : (op.payload as Record<string, unknown>);
    return { data: { id: (row.id as string) || `${op.table}-new`, ...row, balance: 0, total: 13500 } };
  }
  if (op.countOnly) return { count: 0 };
  if (op.table === 'products') return { data: [{ id: 1001, name: 'A' }, { id: 1002, name: 'B' }] };
  return { data: null };
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

describe('POSService.checkout — sin RPC y sin red', () => {
  beforeEach(() => {
    freshIndexedDb();
    __resetOutboxForTests();
    __resetCheckoutRpcForTests();
    fake.reset();
    fake.setHandler(freshDbHandler);
    isAppOnlineMock.mockReturnValue(true);
    (stockMovementService.decrementOnSale as jest.Mock).mockClear();
    emitter.onCartsSaved.mockClear();
  });

  afterEach(() => {
    __resetOutboxForTests();
    uninstallWindow();
  });

  test('Desktop sin red: nada a Supabase, sobre en el outbox, carrito cerrado y ticket «Pendiente de sincronizar»', async () => {
    installWindow({ desktop: true });
    isAppOnlineMock.mockReturnValue(false);
    seedCarts();

    const sale = await POSService.checkout(makeCheckout({ saleId: SALE_ID, createdAt: CREATED_AT }));

    // Ni un insert, ni un select, ni un rpc (tampoco la atómica).
    expect(fake.ops).toHaveLength(0);
    expect(sale.id).toBe(SALE_ID);
    expect(sale.status).toBe('pending_sync');
    expect(sale.pending_sync).toBe(true);
    expect(sale.receipt_number_local).toBe('OFF-7-1');
    expect(sale.user_id).toBe('user-cajero');
    expect(sale.total).toBe(13500);
    // Lo que CheckoutDialog manda a PrintJobsService.enqueueSaleTicket como saleNumber.
    expect(ticketSaleNumber(sale)).toBe('OFF-7-1 (Pendiente de sincronizar)');

    const record = await getOutboxSale(SALE_ID);
    expect(record!.status).toBe('pending');
    expect(record!.envelope.checkout.cart.id).toBe('cart-77');
    expect(record!.envelope.checkout.payments).toHaveLength(2);
    expect(record!.envelope.branch_id).toBe(7);

    // Carrito cerrado igual que en línea (y la pantalla del cliente lo ve).
    const carts = JSON.parse(localStorage.getItem('pos_carts_120') || '[]') as Array<{ id: string }>;
    expect(carts.map((c) => c.id)).toEqual(['cart-78']);
    expect(emitter.onCartsSaved).toHaveBeenCalledTimes(1);
  });

  test('Desktop sin red: el cobro de una deuda no se guarda y avisa', async () => {
    installWindow({ desktop: true });
    isAppOnlineMock.mockReturnValue(false);
    const data = makeCheckout({ saleId: SALE_ID });
    data.cart.sale_id = 'venta-deuda';
    data.cart.invoice_id = 'factura-deuda';
    await expect(POSService.checkout(data)).rejects.toThrow(/deuda pendiente necesita internet/);
    expect(fake.ops).toHaveLength(0);
    expect(await listOutboxSales()).toHaveLength(0);
  });

  test('navegador sin red y sin RPC: la venta falla visible, sin escribir nada y con el carrito abierto', async () => {
    installWindow({ desktop: false });
    isAppOnlineMock.mockReturnValue(false);
    seedCarts();

    await expect(POSService.checkout(makeCheckout())).rejects.toThrow(/servicio de cobro no está disponible/);

    expect(fake.ops.filter((o) => o.action === 'insert' || o.action === 'update')).toHaveLength(0);
    expect(await listOutboxSales()).toHaveLength(0);
    const carts = JSON.parse(localStorage.getItem('pos_carts_120') || '[]') as Array<{ id: string }>;
    expect(carts.map((c) => c.id)).toEqual(['cart-77', 'cart-78']);
  });

  test('reproducción del outbox sin RPC: falla sin tocar sales ni degradarse a N inserts', async () => {
    installWindow({ desktop: true });
    seedCarts();

    await expect(
      POSService.checkout(makeCheckout({ saleId: SALE_ID, createdAt: CREATED_AT, userId: 'user-cajero', replayFromOutbox: true })),
    ).rejects.toThrow(/La venta NO se guardó/);

    expect(fake.ops.filter((o) => o.table === 'sales')).toHaveLength(0);
    expect(fake.ops.filter((o) => o.action === 'insert' || o.action === 'update')).toHaveLength(0);
    expect(stockMovementService.decrementOnSale).not.toHaveBeenCalled();
  });
});
