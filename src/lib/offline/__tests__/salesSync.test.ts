/**
 * Sincronización del outbox (fase 4B): reproducción en orden con el mismo
 * id, backoff, `needs_review` tras 5 fallos sin borrar nada y una sola
 * sincronización aunque lleguen varias reconexiones seguidas.
 *
 * Datos inventados: organización 120, sucursal 7.
 */

jest.mock('@/lib/utils/offlineCache', () => ({ isAppOnline: jest.fn(() => true) }));
jest.mock('@/lib/services/posService', () => ({ POSService: { checkout: jest.fn() } }));

const connectivityListeners: Array<(online: boolean) => void> = [];
jest.mock('@/lib/utils/desktop', () => ({
  isDesktop: jest.fn(() => true),
  isDesktopOnline: jest.fn(async () => true),
  onDesktopConnectivity: jest.fn((l: (online: boolean) => void) => {
    connectivityListeners.push(l);
    return () => {
      const i = connectivityListeners.indexOf(l);
      if (i >= 0) connectivityListeners.splice(i, 1);
    };
  }),
}));

jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});

import { installWindow, uninstallWindow, freshIndexedDb } from './testEnv';
import { isAppOnline } from '@/lib/utils/offlineCache';
import { isDesktop, isDesktopOnline } from '@/lib/utils/desktop';
import { POSService } from '@/lib/services/posService';
import type { CheckoutData } from '@/components/pos/types';
import { __resetOutboxForTests, enqueueOfflineSale, getOutboxSale, listOutboxSales, updateOutboxSale } from '../salesOutbox';
import { __resetSalesSyncForTests, backoffMs, retryOutboxSale, startSalesSync, syncPendingSales } from '../salesSync';

const checkoutMock = POSService.checkout as jest.Mock;
const isAppOnlineMock = isAppOnline as jest.Mock;
const isDesktopMock = isDesktop as jest.Mock;
const isDesktopOnlineMock = isDesktopOnline as jest.Mock;

function makeCheckout(saleId: string, createdAt: string): CheckoutData {
  return {
    cart: {
      id: `cart-${saleId}`,
      organization_id: 120,
      branch_id: 7,
      status: 'active',
      items: [{ id: 'i', product_id: 1, quantity: 1, unit_price: 1000, total: 1000, tax_rate: 0 } as never],
      subtotal: 1000,
      tax_amount: 0,
      tax_total: 0,
      discount_amount: 0,
      discount_total: 0,
      total: 1000,
      created_at: createdAt,
      updated_at: createdAt,
    },
    payments: [{ method: 'cash', amount: 1000 }],
    change: 0,
    total_paid: 1000,
    saleId,
    createdAt,
  };
}

const ctx = { organizationId: 120, branchId: 7, userId: 'user-cajero' };

async function seed(...ids: Array<[string, string]>) {
  for (const [id, createdAt] of ids) {
    await enqueueOfflineSale(makeCheckout(id, createdAt), ctx);
  }
}

describe('salesSync', () => {
  beforeEach(() => {
    freshIndexedDb();
    __resetOutboxForTests();
    __resetSalesSyncForTests();
    installWindow({ desktop: true });
    checkoutMock.mockReset();
    isAppOnlineMock.mockReturnValue(true);
    isDesktopMock.mockReturnValue(true);
    isDesktopOnlineMock.mockResolvedValue(true);
    connectivityListeners.length = 0;
  });

  afterEach(() => {
    __resetSalesSyncForTests();
    __resetOutboxForTests();
    uninstallWindow();
  });

  test('reproduce los pendientes en orden de created_at con el mismo id y los marca synced', async () => {
    await seed(['s2', '2026-09-16T10:02:00.000Z'], ['s1', '2026-09-16T10:01:00.000Z'], ['s3', '2026-09-16T10:03:00.000Z']);
    checkoutMock.mockImplementation(async (d: CheckoutData) => ({ id: d.saleId }));

    const result = await syncPendingSales();

    expect(result).toEqual({ synced: 3, failed: 0, needsReview: 0, skipped: 0 });
    expect(checkoutMock.mock.calls.map((c) => c[0].saleId)).toEqual(['s1', 's2', 's3']);
    const first = checkoutMock.mock.calls[0][0] as CheckoutData;
    expect(first.replayFromOutbox).toBe(true);
    expect(first.createdAt).toBe('2026-09-16T10:01:00.000Z');
    expect(first.userId).toBe('user-cajero');
    expect(first.cart.id).toBe('cart-s1');
    for (const id of ['s1', 's2', 's3']) {
      const r = await getOutboxSale(id);
      expect(r!.status).toBe('synced');
      expect(r!.synced_at).toBeTruthy();
      expect(r!.last_error).toBeNull();
    }
  });

  test('un fallo deja el sobre pending con attempts++ y backoff; sin force no se reintenta antes de tiempo', async () => {
    await seed(['f1', '2026-09-16T10:01:00.000Z']);
    checkoutMock.mockRejectedValue(new Error('PGRST: fallo de red'));

    const r1 = await syncPendingSales({ now: () => 1_000_000 });
    expect(r1).toEqual({ synced: 0, failed: 1, needsReview: 0, skipped: 0 });
    const after1 = await getOutboxSale('f1');
    expect(after1!.status).toBe('pending');
    expect(after1!.attempts).toBe(1);
    expect(after1!.last_error).toContain('fallo de red');
    expect(after1!.next_attempt_at).toBe(1_000_000 + backoffMs(1));

    const r2 = await syncPendingSales({ now: () => 1_000_000 + 1_000 });
    expect(r2.skipped).toBe(1);
    expect(checkoutMock).toHaveBeenCalledTimes(1);

    const r3 = await syncPendingSales({ now: () => 1_000_000 + backoffMs(1) + 1 });
    expect(r3.failed).toBe(1);
    expect(checkoutMock).toHaveBeenCalledTimes(2);
    expect((await getOutboxSale('f1'))!.attempts).toBe(2);
  });

  test('tras 5 fallos pasa a needs_review, conserva el sobre y el error, y no se vuelve a reproducir sola', async () => {
    await seed(['nr', '2026-09-16T10:01:00.000Z']);
    checkoutMock.mockRejectedValue({ code: '23503', message: 'violates foreign key', details: 'Key (customer_id) is not present' });

    for (let i = 0; i < 5; i++) {
      await syncPendingSales({ force: true });
    }
    const record = await getOutboxSale('nr');
    expect(record).not.toBeNull();
    expect(record!.status).toBe('needs_review');
    expect(record!.attempts).toBe(5);
    expect(record!.last_error).toBe('23503 — violates foreign key — Key (customer_id) is not present');
    expect(record!.envelope.checkout.cart.items).toHaveLength(1);
    expect(record!.envelope.checkout.payments[0].amount).toBe(1000);

    checkoutMock.mockClear();
    const r = await syncPendingSales({ force: true });
    expect(r).toEqual({ synced: 0, failed: 0, needsReview: 0, skipped: 0 });
    expect(checkoutMock).not.toHaveBeenCalled();
    expect((await listOutboxSales(['needs_review'])).map((x) => x.id)).toEqual(['nr']);
  });

  test('«Reintentar» desde la bandeja vuelve a pending, reproduce ya y sincroniza', async () => {
    await seed(['rv', '2026-09-16T10:01:00.000Z']);
    await updateOutboxSale('rv', { status: 'needs_review', attempts: 5, last_error: 'x' });
    checkoutMock.mockResolvedValue({ id: 'rv' });

    const r = await retryOutboxSale('rv');
    expect(r.synced).toBe(1);
    const record = await getOutboxSale('rv');
    expect(record!.status).toBe('synced');
    expect(record!.attempts).toBe(0);
    expect(record!.last_error).toBeNull();
  });

  test('dos reconexiones seguidas producen una sola sincronización', async () => {
    await seed(['a', '2026-09-16T10:01:00.000Z'], ['b', '2026-09-16T10:02:00.000Z']);
    let release: () => void = () => {};
    const gate = new Promise<void>((res) => {
      release = res;
    });
    checkoutMock.mockImplementation(async (d: CheckoutData) => {
      await gate;
      return { id: d.saleId };
    });

    const stop = startSalesSync();
    expect(connectivityListeners).toHaveLength(1);
    // Arranque con red (isDesktopOnline → true) + dos eventos de reconexión.
    await Promise.resolve();
    connectivityListeners[0](true);
    connectivityListeners[0](true);
    const p1 = syncPendingSales();
    const p2 = syncPendingSales();
    expect(p1).toBe(p2);

    release();
    const result = await p1;
    expect(result.synced).toBe(2);
    expect(checkoutMock).toHaveBeenCalledTimes(2);
    expect((await listOutboxSales(['synced'])).map((r) => r.id)).toEqual(['a', 'b']);
    stop();
    expect(connectivityListeners).toHaveLength(0);
  });

  test('si la red se cae a mitad de la cola, el resto queda pending sin quemar intentos', async () => {
    await seed(['x1', '2026-09-16T10:01:00.000Z'], ['x2', '2026-09-16T10:02:00.000Z']);
    checkoutMock.mockImplementation(async (d: CheckoutData) => {
      isAppOnlineMock.mockReturnValue(false);
      return { id: d.saleId };
    });
    const r = await syncPendingSales();
    expect(r).toEqual({ synced: 1, failed: 0, needsReview: 0, skipped: 1 });
    expect((await getOutboxSale('x2'))!.status).toBe('pending');
    expect((await getOutboxSale('x2'))!.attempts).toBe(0);
  });

  test('un sobre que quedó en syncing (app cerrada a mitad) se vuelve a intentar', async () => {
    await seed(['orphan', '2026-09-16T10:01:00.000Z']);
    await updateOutboxSale('orphan', { status: 'syncing' });
    checkoutMock.mockResolvedValue({ id: 'orphan' });
    const r = await syncPendingSales();
    expect(r.synced).toBe(1);
    expect((await getOutboxSale('orphan'))!.status).toBe('synced');
  });

  test('en navegador startSalesSync no hace nada', () => {
    isDesktopMock.mockReturnValue(false);
    const stop = startSalesSync();
    expect(connectivityListeners).toHaveLength(0);
    stop();
  });

  test('backoff: 30 s, 1 min, 2 min, 4 min, tope 10 min', () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(3)).toBe(120_000);
    expect(backoffMs(4)).toBe(240_000);
    expect(backoffMs(9)).toBe(600_000);
  });
});
