/**
 * Cola HTTP honesta (fase 4F) y conteos del banner.
 *
 * Contrato de `resolveOfflineDataRequest` para escrituras REST sin red:
 *  - tabla con outbox propio (ventas 4B, clientes 4D, caja 4F) → 503
 *    `OFFLINE_OUTBOX_TABLE`, nunca se encola;
 *  - tabla reproducible sin id devuelto (`product_favorites`,
 *    `category_favorites`, `print_jobs`) → se encola y 202 como siempre;
 *  - cualquier otra → 503 `OFFLINE_WRITE_REQUIRES_NETWORK` con «Sin
 *    conexión: esta acción requiere internet» en `message` (raíz, lo que
 *    `supabase-js` expone como `error.message`) y evento
 *    `goadmin:offline-write-rejected` para el toast; nada se encola.
 *  - GET y RPC de lectura no cambian.
 *
 * Banner: `outboxCounts` suma los tres outboxes y arma
 * «N ventas · N clientes · N movimientos de caja pendientes de sincronizar».
 */

jest.mock('@/lib/utils/desktop', () => ({
  isDesktop: jest.fn(() => true),
  desktopReportsConnectivity: jest.fn(() => false),
  getDesktopBridge: jest.fn(() => null),
  onDesktopConnectivity: jest.fn(() => () => {}),
  isDesktopOnline: jest.fn(async () => false),
}));
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: () => { throw new Error('no'); } } }));

jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'log').mockImplementation(() => {});

import { installWindow, uninstallWindow, freshIndexedDb } from './testEnv';
import {
  OFFLINE_OUTBOX_TABLE_CODE,
  OFFLINE_WRITE_REJECTED_EVENT,
  OFFLINE_WRITE_REQUIRES_NETWORK_CODE,
  OFFLINE_WRITE_REQUIRES_NETWORK_MESSAGE,
  OUTBOX_TABLES_NOT_QUEUED,
  QUEUEABLE_OFFLINE_WRITE_TABLES,
  SALE_TABLES_NOT_QUEUED,
  getQueuedActions,
  resolveOfflineDataRequest,
  setCachedResponse,
} from '@/lib/utils/offlineCache';
import { __resetOutboxForTests, enqueueOfflineSale } from '../salesOutbox';
import { enqueueOfflineCustomer, updateOutboxCustomer } from '../customersOutbox';
import { __resetCashOutboxForTests, enqueueCashMovement, enqueueCashSessionOpen } from '../cashOutbox';
import { closeCatalogDB } from '../catalogStore';
import { formatOutboxCounts, getOutboxCounts, pendingLabel, reviewLabel, totalOf } from '../outboxCounts';
import type { CheckoutData } from '@/components/pos/types';

const BASE = 'https://example.supabase.co/rest/v1';
let events: Array<{ type: string; detail?: unknown }> = [];

beforeEach(async () => {
  freshIndexedDb();
  const win = installWindow({ desktop: true });
  void win;
  events = [];
  (globalThis as { window: { addEventListener: (t: string, l: (e: unknown) => void) => void } }).window.addEventListener(OFFLINE_WRITE_REJECTED_EVENT, (e) => events.push(e as { type: string; detail?: unknown }));
  __resetOutboxForTests();
  await __resetCashOutboxForTests();
  await closeCatalogDB();
});

afterEach(() => {
  uninstallWindow();
});

async function write(table: string, method = 'POST', body = '{"x":1}') {
  return resolveOfflineDataRequest({ url: `${BASE}/${table}?select=*`, method, body, headers: { apikey: 'k' } });
}

describe('escrituras REST sin red', () => {
  it('las tablas con outbox propio responden 503 OFFLINE_OUTBOX_TABLE y no se encolan', async () => {
    for (const table of ['sales', 'payments', 'customers', 'cash_sessions', 'cash_movements']) {
      const res = await write(table, table === 'cash_sessions' ? 'PATCH' : 'POST');
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.code).toBe(OFFLINE_OUTBOX_TABLE_CODE);
      expect(body.message).toContain(OFFLINE_WRITE_REQUIRES_NETWORK_MESSAGE);
      expect(body.message).toContain(table);
      expect(body.data).toBeNull();
    }
    expect(await getQueuedActions()).toHaveLength(0);
    expect(events).toHaveLength(5);
    expect(events[0].detail).toMatchObject({ table: 'sales', method: 'POST', code: OFFLINE_OUTBOX_TABLE_CODE });
    for (const t of SALE_TABLES_NOT_QUEUED) expect(OUTBOX_TABLES_NOT_QUEUED.has(t)).toBe(true);
  });

  it('cualquier otra tabla responde 503 «Sin conexión: esta acción requiere internet» y no se encola (nunca más un 202 con data null)', async () => {
    for (const [table, method] of [
      ['suppliers', 'POST'],
      ['products', 'PATCH'],
      ['purchase_orders', 'DELETE'],
      ['opportunities', 'PUT'],
    ] as const) {
      const res = await write(table, method);
      expect(res.status).toBe(503);
      expect(res.headers.get('X-Offline-Rejected')).toBe(OFFLINE_WRITE_REQUIRES_NETWORK_CODE);
      const body = await res.json();
      expect(body).toMatchObject({ message: OFFLINE_WRITE_REQUIRES_NETWORK_MESSAGE, code: OFFLINE_WRITE_REQUIRES_NETWORK_CODE, data: null });
      expect(body.error.message).toBe(OFFLINE_WRITE_REQUIRES_NETWORK_MESSAGE);
      expect(body.queued).toBeUndefined();
    }
    expect(await getQueuedActions()).toHaveLength(0);
    expect(events.map((e) => (e.detail as { table: string }).table)).toEqual(['suppliers', 'products', 'purchase_orders', 'opportunities']);
  });

  it('solo las tablas reproducibles sin id devuelto siguen encolándose con 202', async () => {
    expect(Array.from(QUEUEABLE_OFFLINE_WRITE_TABLES).sort()).toEqual(['category_favorites', 'print_jobs', 'product_favorites']);
    for (const table of QUEUEABLE_OFFLINE_WRITE_TABLES) {
      const res = await write(table);
      expect(res.status).toBe(202);
      expect(await res.json()).toMatchObject({ queued: true, offline: true });
    }
    const del = await write('product_favorites', 'DELETE', '');
    expect(del.status).toBe(202);
    const queued = await getQueuedActions();
    expect(queued.map((q) => q.method)).toEqual(['POST', 'POST', 'POST', 'DELETE']);
    expect(events).toHaveLength(0);
  });

  it('GET y RPC de lectura no cambian; la RPC de escritura sigue en 503 sin evento de escritura', async () => {
    // `offlineCache` conserva su conexión a `goadmin-offline` entre tests: se compara el tamaño de la cola, no el absoluto.
    const before = (await getQueuedActions()).length;
    await setCachedResponse(`${BASE}/suppliers?select=*`, 'GET', '[{"id":1}]', 200);
    const get = await resolveOfflineDataRequest({ url: `${BASE}/suppliers?select=*`, method: 'GET', body: '', headers: {} });
    expect(get.status).toBe(200);
    const rpc = await resolveOfflineDataRequest({ url: `${BASE}/rpc/fn_register_stock_entry`, method: 'POST', body: '{}', headers: {} });
    expect(rpc.status).toBe(503);
    expect((await getQueuedActions()).length).toBe(before);
    expect(events).toHaveLength(0);
  });
});

describe('banner con conteos por tipo', () => {
  function makeCheckout(saleId: string): CheckoutData {
    return {
      cart: { id: `c-${saleId}`, organization_id: 120, branch_id: 7, status: 'active', items: [], subtotal: 1, tax_amount: 0, tax_total: 0, discount_amount: 0, discount_total: 0, total: 1, created_at: 'x', updated_at: 'x' },
      payments: [{ method: 'cash', amount: 1 }],
      change: 0,
      total_paid: 1,
      saleId,
      createdAt: '2026-09-21T10:00:00.000Z',
    };
  }

  it('formatea «N ventas · N clientes · N movimientos de caja» con singular/plural y omite ceros', () => {
    expect(formatOutboxCounts({ sales: 2, customers: 1, cash: 3 })).toBe('2 ventas · 1 cliente · 3 movimientos de caja');
    expect(formatOutboxCounts({ sales: 1, customers: 0, cash: 1 })).toBe('1 venta · 1 movimiento de caja');
    expect(pendingLabel({ sales: 2, customers: 1, cash: 3 })).toBe('2 ventas · 1 cliente · 3 movimientos de caja pendientes de sincronizar');
    expect(pendingLabel({ sales: 0, customers: 1, cash: 0 })).toBe('1 cliente pendiente de sincronizar');
    expect(pendingLabel({ sales: 0, customers: 0, cash: 0 })).toBeNull();
    expect(reviewLabel({ sales: 1, customers: 0, cash: 0 })).toBe('1 venta requiere revisión (detalle en el POS)');
    expect(reviewLabel({ sales: 1, customers: 1, cash: 0 })).toBe('1 venta · 1 cliente requieren revisión (detalle en el POS)');
    expect(totalOf({ sales: 1, customers: 2, cash: 3 })).toBe(6);
  });

  it('getOutboxCounts suma los tres outboxes separando pendientes de revisión', async () => {
    await enqueueOfflineSale(makeCheckout('11111111-1111-4111-8111-111111111111'), { organizationId: 120, branchId: 7, userId: 'u' });
    await enqueueOfflineSale(makeCheckout('22222222-2222-4222-8222-222222222222'), { organizationId: 120, branchId: 7, userId: 'u' });
    const customer = await enqueueOfflineCustomer({
      organization_id: 120, branch_id: 7, first_name: 'Ana', last_name: 'P', email: null, phone: null, identification_type: null, identification_number: null,
      address: null, customer_type: 'person', company_name: null, roles: [], tags: [], preferences: {}, fiscal_responsibilities: null, fiscal_municipality_id: null,
      metadata: {}, created_at: '2026-09-21T10:00:00.000Z',
    });
    await updateOutboxCustomer(customer.id, { status: 'needs_review', attempts: 5, last_error: 'x' });
    const session = await enqueueCashSessionOpen({ organizationId: 120, branchId: 7, openedBy: 'u', initialAmount: 1, notes: null });
    await enqueueCashMovement({ session, type: 'in', concept: 'a', amount: 1, userId: 'u', notes: null });
    await enqueueCashMovement({ session, type: 'out', concept: 'b', amount: 1, userId: 'u', notes: null });

    const counts = await getOutboxCounts();
    expect(counts).toEqual({ pending: { sales: 2, customers: 0, cash: 3 }, needsReview: { sales: 0, customers: 1, cash: 0 } });
    expect(pendingLabel(counts.pending)).toBe('2 ventas · 3 movimientos de caja pendientes de sincronizar');
    expect(reviewLabel(counts.needsReview)).toBe('1 cliente requiere revisión (detalle en el POS)');
  });
});
