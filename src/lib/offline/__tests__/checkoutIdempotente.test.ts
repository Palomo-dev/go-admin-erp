/**
 * `POSService.checkout` con id generado en el cliente (fase 4B): camino de
 * RESPALDO de N inserts, que desde la fase 4E solo se usa cuando la RPC
 * `pos_checkout_v1` no existe en el entorno (aquí el cliente de mentira
 * responde PGRST202). El camino principal por RPC se prueba en
 * `checkoutRpc.test.ts`.
 *
 * Contrato que fijan estos tests:
 *   - Desktop sin red: no se emite ninguna operación a Supabase; el sobre va
 *     al outbox, el carrito se cierra y la venta provisional lleva el número
 *     local que el ticket imprime como «Pendiente de sincronizar».
 *   - Navegador: comportamiento de siempre (insert sin id, aunque no haya red).
 *   - Con `saleId`: el insert en `sales` usa ese id y `createdAt`.
 *   - Venta ya existente: no se repite nada.
 *   - Reproducción que murió a mitad: el reintento completa solo lo que falta.
 *
 * Datos inventados: organización 120, sucursal 7, usuario `user-cajero`.
 */

import { createFakeSupabase, writesTo, type FakeHandler, type FakeOp, type FakeResult } from './fakeSupabase';

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
import { generateInvoiceNumber } from '@/lib/utils/invoiceUtils';
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

/** Envuelve un handler para que la RPC atómica «no exista» (camino de respaldo). */
function withRpcMissing(handler: FakeHandler): FakeHandler {
  return (op: FakeOp) => (op.table === `rpc:${POS_CHECKOUT_RPC}` ? RPC_MISSING : handler(op));
}

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

describe('POSService.checkout — ids de cliente e idempotencia', () => {
  beforeEach(() => {
    freshIndexedDb();
    __resetOutboxForTests();
    __resetCheckoutRpcForTests();
    fake.reset();
    fake.setHandler(freshDbHandler);
    isAppOnlineMock.mockReturnValue(true);
    (stockMovementService.decrementOnSale as jest.Mock).mockClear();
    (generateInvoiceNumber as jest.Mock).mockClear();
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

  test('navegador sin red: comportamiento de siempre (va a Supabase, sin id de cliente)', async () => {
    installWindow({ desktop: false });
    isAppOnlineMock.mockReturnValue(false);
    seedCarts();

    const sale = await POSService.checkout(makeCheckout());

    const [salesInsert] = writesTo(fake.ops, 'sales');
    expect(salesInsert.action).toBe('insert');
    const row = salesInsert.payload as Record<string, unknown>;
    expect(row.id).toBeUndefined();
    expect(row.created_at).toBeUndefined();
    expect(row.user_id).toBe('user-sync');
    expect(sale.id).toBe('sales-new');
    expect(await listOutboxSales()).toHaveLength(0);
    // Sin saleId no hay ni un SELECT de idempotencia sobre sales.
    expect(fake.ops.filter((o) => o.table === 'sales' && o.action === 'select')).toHaveLength(0);
  });

  test('con saleId y createdAt el insert en sales usa ese id, esa fecha y el usuario del sobre', async () => {
    installWindow({ desktop: true });
    seedCarts();

    const sale = await POSService.checkout(makeCheckout({ saleId: SALE_ID, createdAt: CREATED_AT, userId: 'user-cajero', replayFromOutbox: true }));

    const selects = fake.ops.filter((o) => o.table === 'sales' && o.action === 'select');
    expect(selects).toHaveLength(1);
    expect(selects[0].filters).toEqual({ id: SALE_ID, organization_id: 120 });

    const [salesInsert] = writesTo(fake.ops, 'sales');
    const row = salesInsert.payload as Record<string, unknown>;
    expect(row.id).toBe(SALE_ID);
    expect(row.created_at).toBe(CREATED_AT);
    expect(row.sale_date).toBe(CREATED_AT);
    expect(row.user_id).toBe('user-cajero');
    expect(sale.id).toBe(SALE_ID);

    const invoiceRow = writesTo(fake.ops, 'invoice_sales')[0].payload as Record<string, unknown>;
    expect(invoiceRow.issue_date).toBe(CREATED_AT);
    expect(invoiceRow.sale_id).toBe(SALE_ID);

    expect(writesTo(fake.ops, 'sale_items')).toHaveLength(1);
    expect(writesTo(fake.ops, 'payments')).toHaveLength(2);
    expect(writesTo(fake.ops, 'invoice_items')).toHaveLength(1);
    expect(writesTo(fake.ops, 'tips')).toHaveLength(1);
    expect(stockMovementService.decrementOnSale).toHaveBeenCalledTimes(1);
    // Al no ser una venta existente, no se consultan tablas hijas.
    expect(fake.ops.filter((o) => o.countOnly)).toHaveLength(0);
  });

  test('venta ya existente: devuelve la existente y no repite ningún insert', async () => {
    installWindow({ desktop: true });
    const existing = { id: SALE_ID, organization_id: 120, branch_id: 7, total: 13500, balance: 0, status: 'paid' };
    const invoice = { id: 'inv-1', sale_id: SALE_ID, number: 'FACT-000001', balance: 0 };
    fake.setHandler(withRpcMissing((op) => {
      if (op.table === 'sales' && op.action === 'select') return { data: existing };
      if (op.table === 'invoice_sales' && op.action === 'select') return { data: invoice };
      if (op.countOnly) return { count: 2 };
      if (op.action === 'insert') throw new Error(`No debía insertar en ${op.table}`);
      return { data: null };
    }));

    const sale = await POSService.checkout(makeCheckout({ saleId: SALE_ID, createdAt: CREATED_AT, replayFromOutbox: true }));

    expect(sale).toEqual(existing);
    expect(fake.ops.filter((o) => o.action === 'insert' || o.action === 'update')).toHaveLength(0);
    // Las únicas RPC permitidas son la lectura de monedas y el intento (fallido:
    // PGRST202) de la atómica; ninguna de escritura (promociones, stock).
    expect(fake.ops.filter((o) => o.action === 'rpc' && o.table !== 'rpc:get_organization_currencies' && o.table !== `rpc:${POS_CHECKOUT_RPC}`)).toHaveLength(0);
    expect(stockMovementService.decrementOnSale).not.toHaveBeenCalled();
    expect(generateInvoiceNumber).not.toHaveBeenCalled();
  });

  test('reproducción que murió tras sale_items y stock: el reintento crea factura, pagos, líneas de factura y propina, sin duplicar', async () => {
    installWindow({ desktop: true });
    const existing = { id: SALE_ID, organization_id: 120, branch_id: 7, total: 13500, balance: 0, status: 'paid' };
    fake.setHandler(withRpcMissing((op) => {
      if (op.table === 'sales' && op.action === 'select') return { data: existing };
      if (op.table === 'invoice_sales' && op.action === 'select') return { data: null };
      if (op.countOnly) {
        if (op.table === 'sale_items') return { count: 2 };
        if (op.table === 'stock_movements') return { count: 2 };
        return { count: 0 };
      }
      return freshDbHandler(op);
    }));

    await POSService.checkout(makeCheckout({ saleId: SALE_ID, createdAt: CREATED_AT, replayFromOutbox: true }));

    expect(writesTo(fake.ops, 'sales')).toHaveLength(0);
    expect(writesTo(fake.ops, 'sale_items')).toHaveLength(0);
    expect(stockMovementService.decrementOnSale).not.toHaveBeenCalled();
    expect(writesTo(fake.ops, 'invoice_sales')).toHaveLength(1);
    expect(writesTo(fake.ops, 'payments')).toHaveLength(2);
    expect(writesTo(fake.ops, 'invoice_items')).toHaveLength(1);
    expect(writesTo(fake.ops, 'tips')).toHaveLength(1);
  });

  test('reproducción que murió con 1 de 2 pagos insertados: el reintento inserta solo el que falta', async () => {
    installWindow({ desktop: true });
    const existing = { id: SALE_ID, organization_id: 120, branch_id: 7, total: 13500, balance: 0, status: 'paid' };
    const invoice = { id: 'inv-1', sale_id: SALE_ID, number: 'FACT-000001', balance: 0 };
    fake.setHandler(withRpcMissing((op) => {
      if (op.table === 'sales' && op.action === 'select') return { data: existing };
      if (op.table === 'invoice_sales' && op.action === 'select') return { data: invoice };
      if (op.countOnly) {
        if (op.table === 'payments') {
          expect(op.filters).toEqual({ source: 'invoice_sales', source_id: 'inv-1' });
          return { count: 1 };
        }
        if (op.table === 'invoice_items' || op.table === 'tips') return { count: 0 };
        return { count: 2 };
      }
      return freshDbHandler(op);
    }));

    await POSService.checkout(makeCheckout({ saleId: SALE_ID, createdAt: CREATED_AT, replayFromOutbox: true, change: 0 }));

    const paymentInserts = writesTo(fake.ops, 'payments');
    expect(paymentInserts).toHaveLength(1);
    const row = paymentInserts[0].payload as Record<string, unknown>;
    expect(row.method).toBe('card');
    expect(row.amount).toBe(3000);
    expect(row.source_id).toBe('inv-1');
    expect(writesTo(fake.ops, 'invoice_sales')).toHaveLength(0);
    expect(generateInvoiceNumber).not.toHaveBeenCalled();
  });

  test('carrera 23505 al insertar sales: se toma la existente y se completa en vez de fallar', async () => {
    installWindow({ desktop: true });
    seedCarts();
    const existing = { id: SALE_ID, organization_id: 120, branch_id: 7, total: 13500, balance: 0, status: 'paid' };
    let salesSelects = 0;
    fake.setHandler(withRpcMissing((op) => {
      if (op.table === 'sales' && op.action === 'select') {
        salesSelects++;
        return { data: salesSelects === 1 ? null : existing };
      }
      if (op.table === 'sales' && op.action === 'insert') return { error: { code: '23505', message: 'duplicate key' } };
      if (op.table === 'invoice_sales' && op.action === 'select') return { data: null };
      if (op.countOnly) return { count: op.table === 'sale_items' || op.table === 'stock_movements' ? 2 : 0 };
      return freshDbHandler(op);
    }));

    const sale = await POSService.checkout(makeCheckout({ saleId: SALE_ID, createdAt: CREATED_AT, replayFromOutbox: true }));

    expect(sale.id).toBe(SALE_ID);
    expect(salesSelects).toBe(2);
    expect(writesTo(fake.ops, 'sale_items')).toHaveLength(0);
    expect(writesTo(fake.ops, 'invoice_sales')).toHaveLength(1);
    expect(writesTo(fake.ops, 'payments')).toHaveLength(2);
  });
});
