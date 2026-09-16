/**
 * Outbox de ventas del Desktop (fase 4B): guardar, listar, actualizar,
 * numerar y purgar sobres sin tocar Supabase.
 *
 * Datos inventados: organización 120, sucursal 7.
 */

jest.mock('@/lib/utils/offlineCache', () => ({ isAppOnline: jest.fn(() => false) }));

import { installWindow, uninstallWindow, freshIndexedDb } from './testEnv';
import { isAppOnline } from '@/lib/utils/offlineCache';
import type { CheckoutData } from '@/components/pos/types';
import {
  __resetOutboxForTests,
  OUTBOX_CHANGED_EVENT,
  buildProvisionalSale,
  countPendingSales,
  countSalesNeedingReview,
  enqueueOfflineSale,
  exportOutboxSale,
  getOutboxSale,
  listOutboxSales,
  nextLocalReceiptNumber,
  pruneSyncedSales,
  shouldCheckoutOffline,
  ticketSaleNumber,
  updateOutboxSale,
} from '../salesOutbox';

const isAppOnlineMock = isAppOnline as jest.Mock;

function makeCheckout(overrides: Partial<CheckoutData> = {}): CheckoutData {
  return {
    cart: {
      id: 'cart-1',
      organization_id: 120,
      branch_id: 7,
      status: 'active',
      items: [
        {
          id: 'item-1',
          product_id: 1001,
          quantity: 2,
          unit_price: 5000,
          total: 10000,
          tax_rate: 19,
          tax_amount: 1596.64,
          product: { id: 1001, name: 'Producto de prueba' },
        } as never,
      ],
      subtotal: 8403.36,
      tax_amount: 1596.64,
      tax_total: 1596.64,
      discount_amount: 0,
      discount_total: 0,
      total: 10000,
      created_at: '2026-09-16T10:00:00.000Z',
      updated_at: '2026-09-16T10:00:00.000Z',
      tax_included: true,
    },
    payments: [{ method: 'cash', amount: 10000 }],
    change: 0,
    total_paid: 10000,
    tax_included: true,
    ...overrides,
  };
}

const ctx = { organizationId: 120, branchId: 7, userId: 'user-cajero' };

describe('salesOutbox', () => {
  let events: string[];

  beforeEach(() => {
    freshIndexedDb();
    __resetOutboxForTests();
    events = installWindow({ desktop: true }).events;
    isAppOnlineMock.mockReturnValue(false);
  });

  afterEach(() => {
    __resetOutboxForTests();
    uninstallWindow();
  });

  test('enqueueOfflineSale guarda el sobre completo y devuelve la venta provisional con el mismo id', async () => {
    const checkout = makeCheckout({ saleId: '11111111-1111-4111-8111-111111111111', createdAt: '2026-09-16T10:05:00.000Z' });
    const sale = await enqueueOfflineSale(checkout, ctx);

    expect(sale.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(sale.status).toBe('pending_sync');
    expect(sale.pending_sync).toBe(true);
    expect(sale.receipt_number_local).toBe('OFF-7-1');
    expect(sale.sale_number).toBe('OFF-7-1');
    expect(sale.total).toBe(10000);
    expect(sale.balance).toBe(0);
    expect(sale.payment_status).toBe('paid');
    expect(sale.sale_date).toBe('2026-09-16T10:05:00.000Z');
    expect(sale.user_id).toBe('user-cajero');

    const record = await getOutboxSale(sale.id);
    expect(record).not.toBeNull();
    expect(record!.status).toBe('pending');
    expect(record!.attempts).toBe(0);
    expect(record!.last_error).toBeNull();
    expect(record!.created_at).toBe('2026-09-16T10:05:00.000Z');
    expect(record!.envelope.organization_id).toBe(120);
    expect(record!.envelope.branch_id).toBe(7);
    expect(record!.envelope.user_id).toBe('user-cajero');
    expect(record!.envelope.checkout.saleId).toBe(sale.id);
    expect(record!.envelope.checkout.userId).toBe('user-cajero');
    expect(record!.envelope.checkout.replayFromOutbox).toBeUndefined();
    expect(record!.envelope.checkout.cart.items).toHaveLength(1);
    expect(record!.envelope.checkout.payments).toEqual([{ method: 'cash', amount: 10000 }]);
    expect(record!.envelope.totals).toEqual({
      subtotal: 8403.36,
      tax_total: 1596.64,
      discount_total: 0,
      total: 10000,
      total_paid: 10000,
      change: 0,
    });
    expect(events).toContain(OUTBOX_CHANGED_EVENT);
  });

  test('sin saleId lo genera; propina y flete entran en el total provisional', async () => {
    const sale = await enqueueOfflineSale(makeCheckout({ tip_amount: 500, shipping_fee: 1500, total_paid: 12000 }), ctx);
    expect(sale.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(sale.total).toBe(12000);
    expect(sale.tip_amount).toBe(500);
    expect(sale.delivery_fee).toBe(1500);
    const record = await getOutboxSale(sale.id);
    expect(record!.envelope.checkout.saleId).toBe(sale.id);
    expect(record!.envelope.checkout.createdAt).toBeTruthy();
  });

  test('el número local es consecutivo por sucursal y sobrevive en localStorage', () => {
    expect(nextLocalReceiptNumber(120, 7)).toBe('OFF-7-1');
    expect(nextLocalReceiptNumber(120, 7)).toBe('OFF-7-2');
    expect(nextLocalReceiptNumber(120, 9)).toBe('OFF-9-1');
    expect(localStorage.getItem('goadmin-outbox:receipt-seq:120:7')).toBe('2');
  });

  test('ticketSaleNumber marca la venta pendiente en el papel y deja las demás igual', () => {
    expect(ticketSaleNumber({ pending_sync: true, receipt_number_local: 'OFF-7-3' })).toBe('OFF-7-3 (Pendiente de sincronizar)');
    expect(ticketSaleNumber({ sale_number: 'V-100' })).toBe('V-100');
    expect(ticketSaleNumber({})).toBeUndefined();
  });

  test('shouldCheckoutOffline: solo Desktop sin red; en navegador siempre false', () => {
    isAppOnlineMock.mockReturnValue(false);
    expect(shouldCheckoutOffline()).toBe(true);
    isAppOnlineMock.mockReturnValue(true);
    expect(shouldCheckoutOffline()).toBe(false);

    uninstallWindow();
    installWindow({ desktop: false });
    isAppOnlineMock.mockReturnValue(false);
    expect(shouldCheckoutOffline()).toBe(false);
  });

  test('listOutboxSales ordena por created_at y filtra por estado; los contadores cuadran', async () => {
    await enqueueOfflineSale(makeCheckout({ saleId: 'b', createdAt: '2026-09-16T10:02:00.000Z' }), ctx);
    await enqueueOfflineSale(makeCheckout({ saleId: 'a', createdAt: '2026-09-16T10:01:00.000Z' }), ctx);
    await enqueueOfflineSale(makeCheckout({ saleId: 'c', createdAt: '2026-09-16T10:03:00.000Z' }), ctx);
    await updateOutboxSale('c', { status: 'needs_review', attempts: 5, last_error: 'boom' });

    const all = await listOutboxSales();
    expect(all.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect((await listOutboxSales(['pending'])).map((r) => r.id)).toEqual(['a', 'b']);
    expect(await countPendingSales()).toBe(2);
    expect(await countSalesNeedingReview()).toBe(1);

    const c = await getOutboxSale('c');
    expect(c!.last_error).toBe('boom');
    expect(c!.envelope.checkout.cart.items).toHaveLength(1);
    expect(await updateOutboxSale('no-existe', { status: 'synced' })).toBeNull();
  });

  test('pruneSyncedSales borra solo synced con más de 7 días; pending y needs_review nunca', async () => {
    const now = Date.parse('2026-09-16T12:00:00.000Z');
    await enqueueOfflineSale(makeCheckout({ saleId: 'old-synced' }), ctx);
    await updateOutboxSale('old-synced', { status: 'synced', synced_at: '2026-09-01T00:00:00.000Z' });
    await enqueueOfflineSale(makeCheckout({ saleId: 'new-synced' }), ctx);
    await updateOutboxSale('new-synced', { status: 'synced', synced_at: '2026-09-15T00:00:00.000Z' });
    await enqueueOfflineSale(makeCheckout({ saleId: 'old-review', createdAt: '2026-08-01T00:00:00.000Z' }), ctx);
    await updateOutboxSale('old-review', { status: 'needs_review', attempts: 5, last_error: 'x', synced_at: null });
    await enqueueOfflineSale(makeCheckout({ saleId: 'old-pending', createdAt: '2026-08-01T00:00:00.000Z' }), ctx);

    const removed = await pruneSyncedSales(7, now);
    expect(removed).toBe(1);
    const ids = (await listOutboxSales()).map((r) => r.id).sort();
    expect(ids).toEqual(['new-synced', 'old-pending', 'old-review']);
  });

  test('exportOutboxSale devuelve JSON legible con el sobre íntegro', async () => {
    const sale = await enqueueOfflineSale(makeCheckout({ saleId: 'exp' }), ctx);
    const record = await getOutboxSale(sale.id);
    const parsed = JSON.parse(exportOutboxSale(record!));
    expect(parsed.id).toBe('exp');
    expect(parsed.envelope.checkout.cart.items[0].product_id).toBe(1001);
    expect(parsed.receipt_number_local).toBe('OFF-7-1');
  });

  test('buildProvisionalSale: saldo y estado de pago con pago parcial', () => {
    const checkout = makeCheckout({ saleId: 'p', createdAt: '2026-09-16T10:00:00.000Z', total_paid: 4000 });
    const sale = buildProvisionalSale(
      {
        checkout,
        totals: { subtotal: 8403.36, tax_total: 1596.64, discount_total: 0, total: 10000, total_paid: 4000, change: 0 },
        organization_id: 120,
        branch_id: 7,
        user_id: null,
      },
      'OFF-7-9',
    );
    expect(sale.balance).toBe(6000);
    expect(sale.payment_status).toBe('partial');
    expect(sale.user_id).toBe('');
  });
});
