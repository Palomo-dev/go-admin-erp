/**
 * Outbox de caja del Desktop (fase 4F): apertura, movimientos y cierre sin red.
 *
 * Contrato:
 *  - abrir sin red → registro `open` en el outbox + sesión con id local
 *    NEGATIVO y `uuid` generado en el cliente en el estado local
 *    (`getActiveSession` la encuentra sin red, con las reglas de alcance);
 *  - movimientos sin red → registro `movement` con uuid propio, id negativo,
 *    visibles en `getSessionMovements` y sumados al resumen;
 *  - cerrar sin red → registro `close` con el resumen calculado sobre las
 *    ventas locales (outbox) + movimientos locales; la sesión deja de estar
 *    abierta en local aunque la réplica siga diciendo `open`;
 *  - `CajasService` en Desktop sin red no hace NINGÚN insert/update en
 *    Supabase; en navegador nada cambia;
 *  - la purga solo toca `synced`; `getCatalogStatus` ignora el estado de caja.
 *
 * Datos inventados: organización 120, sucursal 7.
 */

let online = false;
jest.mock('@/lib/utils/offlineCache', () => ({ isAppOnline: jest.fn(() => online) }));
jest.mock('@/lib/utils/desktop', () => ({
  isDesktop: jest.fn(() => true),
  isDesktopOnline: jest.fn(async () => online),
  onDesktopConnectivity: jest.fn(() => () => {}),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: jest.fn(() => 120),
  getCurrentBranchId: jest.fn(() => 7),
  getBranchFilter: jest.fn(() => 7),
  getCurrentUserId: jest.fn(async () => 'user-cajero'),
}));
jest.mock('@/components/pos/configuracion/configuracionService', () => ({
  ConfiguracionService: { getCashSessionModeConfig: jest.fn(async () => ({ mode: 'branch' })) },
}));
jest.mock('@/components/crm/shared/realtimeTables', () => ({ isRealtimePublished: () => false }));

import { createFakeSupabase, type FakeOp } from './fakeSupabase';
const fake = createFakeSupabase(() => ({ data: null }));
jest.mock('@/lib/supabase/config', () => ({ supabase: fake.client }));

jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'log').mockImplementation(() => {});

import { installWindow, uninstallWindow, freshIndexedDb } from './testEnv';
import { isDesktop } from '@/lib/utils/desktop';
import type { CheckoutData } from '@/components/pos/types';
import { __resetOutboxForTests, enqueueOfflineSale } from '../salesOutbox';
import { closeCatalogDB, getCatalogStatus, setCatalogStoreMeta } from '../catalogStore';
import {
  MAX_ATTEMPTS,
  __resetCashOutboxForTests,
  applyOutboxSalesToSummary,
  countCashNeedingReview,
  countPendingCash,
  enqueueCashMovement,
  enqueueCashSessionClose,
  enqueueCashSessionOpen,
  getLocalCashSessionByUuid,
  getLocalOpenCashSession,
  isCashSessionClosedLocally,
  listCashOutbox,
  listPendingOutboxMovements,
  outboxSalesDeltas,
  pruneSyncedCash,
  updateCashOutboxRecord,
  type CashCloseRecord,
} from '../cashOutbox';
import { CajasService } from '@/components/pos/cajas/CajasService';
import type { CashSummary } from '@/components/pos/cajas/types';

const ORG = 120;
const BRANCH = 7;
const isDesktopMock = isDesktop as jest.Mock;

function writes(ops: FakeOp[]): FakeOp[] {
  return ops.filter((o) => o.action === 'insert' || o.action === 'update' || o.action === 'delete');
}

function makeCheckout(saleId: string, createdAt: string, opts: { cash?: number; card?: number; change?: number; branch?: number; userId?: string } = {}): CheckoutData {
  const cash = opts.cash ?? 1000;
  const card = opts.card ?? 0;
  const change = opts.change ?? 0;
  const total = cash + card - change;
  return {
    cart: {
      id: `cart-${saleId}`,
      organization_id: ORG,
      branch_id: opts.branch ?? BRANCH,
      status: 'active',
      items: [{ id: 'i', product_id: 1, quantity: 1, unit_price: total, total, tax_rate: 0 } as never],
      subtotal: total,
      tax_amount: 0,
      tax_total: 0,
      discount_amount: 0,
      discount_total: 0,
      total,
      created_at: createdAt,
      updated_at: createdAt,
    },
    payments: [
      { method: 'cash', amount: cash },
      ...(card > 0 ? [{ method: 'card', amount: card }] : []),
    ],
    change,
    total_paid: cash + card,
    saleId,
    createdAt,
    userId: opts.userId ?? 'user-cajero',
  };
}

const emptySummary = (initial: number): CashSummary => ({
  initial_amount: initial,
  sales_cash: 0,
  cash_in: 0,
  cash_out: 0,
  expected_amount: initial,
  change_total: 0,
  returns_total: 0,
  folio_consumptions_total: 0,
  cash_receipts_total: 0,
  purchases_total: 0,
  payments_by_method: {},
  income_by_method: {},
  expense_by_method: {},
  sales_total: 0,
  sales_by_method: {},
});

beforeEach(async () => {
  online = false;
  isDesktopMock.mockReturnValue(true);
  freshIndexedDb();
  installWindow({ desktop: true });
  await __resetCashOutboxForTests();
  await closeCatalogDB();
  __resetOutboxForTests();
  fake.reset();
  fake.setHandler(() => ({ data: null }));
  CajasService.invalidateCashSessionModeCache();
});

afterEach(() => {
  uninstallWindow();
});

describe('apertura sin red', () => {
  it('crea el registro open, la sesión local con id negativo y uuid, y CajasService la devuelve como activa', async () => {
    const session = await CajasService.openSession({ initial_amount: 100000, notes: 'Turno mañana' });
    expect(session.id).toBeLessThan(0);
    expect(session.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.status).toBe('open');
    expect(session.pending_sync).toBe(true);
    expect(session.branch_id).toBe(BRANCH);
    expect(session.opened_by).toBe('user-cajero');
    expect(writes(fake.ops)).toHaveLength(0);

    const records = await listCashOutbox();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: 'open', id: session.uuid, session_uuid: session.uuid, session_local_id: session.id, status: 'pending', attempts: 0, server_id: null });
    expect((records[0] as { payload: { initial_amount: number; notes: string } }).payload).toMatchObject({ initial_amount: 100000, notes: 'Turno mañana', opened_by: 'user-cajero' });

    const active = await CajasService.getActiveSession();
    expect(active?.id).toBe(session.id);
    expect(active?.uuid).toBe(session.uuid);
    expect(await countPendingCash()).toBe(1);
  });

  it('no deja abrir dos cajas en la misma sucursal sin red', async () => {
    await CajasService.openSession({ initial_amount: 1000 });
    await expect(CajasService.openSession({ initial_amount: 1000 })).rejects.toThrow(/Ya hay una caja abierta/);
    expect(await listCashOutbox()).toHaveLength(1);
  });

  it('los ids locales son negativos y distintos entre aperturas', async () => {
    const a = await enqueueCashSessionOpen({ organizationId: ORG, branchId: BRANCH, openedBy: 'u', initialAmount: 1, notes: null });
    const b = await enqueueCashSessionOpen({ organizationId: ORG, branchId: 8, openedBy: 'u', initialAmount: 1, notes: null });
    expect(a.id).toBeLessThan(0);
    expect(b.id).toBeLessThan(0);
    expect(a.id).not.toBe(b.id);
    expect(a.uuid).not.toBe(b.uuid);
  });

  it('alcance del estado local: sucursal, global y modo user', async () => {
    await enqueueCashSessionOpen({ organizationId: ORG, branchId: null, openedBy: 'u1', initialAmount: 1, notes: null });
    const branch = await enqueueCashSessionOpen({ organizationId: ORG, branchId: BRANCH, openedBy: 'u2', initialAmount: 2, notes: null });
    expect((await getLocalOpenCashSession({ organizationId: ORG, branchId: BRANCH, mode: 'branch', userId: null }))?.id).toBe(branch.id);
    expect((await getLocalOpenCashSession({ organizationId: ORG, branchId: 9, mode: 'branch', userId: null }))?.branch_id).toBeNull();
    expect((await getLocalOpenCashSession({ organizationId: ORG, branchId: BRANCH, mode: 'user', userId: 'u2' }))?.id).toBe(branch.id);
    expect(await getLocalOpenCashSession({ organizationId: ORG, branchId: BRANCH, mode: 'user', userId: 'otro' })).toBeNull();
    expect(await getLocalOpenCashSession({ organizationId: 121, branchId: BRANCH, mode: 'branch', userId: null })).toBeNull();
  });

  it('la sesión de la réplica manda si sigue abierta y no se cerró localmente', async () => {
    fake.setHandler((op) =>
      op.table === 'cash_sessions' && op.action === 'select' && op.single === 'maybeSingle'
        ? { data: { id: 55, uuid: 'srv-uuid', organization_id: ORG, branch_id: BRANCH, opened_by: 'user-cajero', opened_at: '2026-09-21T08:00:00.000Z', initial_amount: 5000, status: 'open' } }
        : { data: null },
    );
    const active = await CajasService.getActiveSession();
    expect(active?.id).toBe(55);
    expect(active?.pending_sync).toBeUndefined();
  });
});

describe('movimientos sin red', () => {
  it('registra ingreso y retiro con id negativo y uuid, visibles en getSessionMovements y en el resumen', async () => {
    const session = await CajasService.openSession({ initial_amount: 100000 });
    const inMov = await CajasService.addMovement({ type: 'in', concept: 'Cambio', amount: 20000 });
    const outMov = await CajasService.addMovement({ type: 'out', concept: 'Pago domicilio', amount: 5000 });
    expect(inMov.id).toBeLessThan(0);
    expect(outMov.id).toBeLessThan(0);
    expect(inMov.uuid).not.toBe(outMov.uuid);
    expect(inMov.pending_sync).toBe(true);
    expect(inMov.cash_session_id).toBe(session.id);
    expect(writes(fake.ops)).toHaveLength(0);

    const movements = await CajasService.getSessionMovements(session.id);
    expect(movements.map((m) => m.concept)).toEqual(['Cambio', 'Pago domicilio']);
    expect(await listPendingOutboxMovements({ uuid: session.uuid })).toHaveLength(2);

    const summary = await CajasService.getCashSummary(session.id);
    expect(summary.cash_in).toBe(20000);
    expect(summary.cash_out).toBe(5000);
    expect(summary.expected_amount).toBe(115000);
    expect(await countPendingCash()).toBe(3);
  });

  it('sin caja abierta no se registra nada', async () => {
    await expect(CajasService.addMovement({ type: 'in', concept: 'x', amount: 1 })).rejects.toThrow(/No hay sesión de caja abierta/);
    expect(await listCashOutbox()).toHaveLength(0);
  });
});

describe('cierre sin red', () => {
  it('calcula el resumen con las ventas locales del outbox y los movimientos, encola el cierre y cierra la sesión en local', async () => {
    const session = await CajasService.openSession({ initial_amount: 100000 });
    await CajasService.addMovement({ type: 'in', concept: 'Cambio', amount: 10000 });
    // Ventas posteriores a la apertura y anteriores a "ahora" (las futuras no cuentan).
    const now = () => new Date().toISOString();
    await enqueueOfflineSale(makeCheckout('s1', now(), { cash: 50000, change: 5000 }), { organizationId: ORG, branchId: BRANCH, userId: 'user-cajero' });
    await enqueueOfflineSale(makeCheckout('s2', now(), { cash: 20000, card: 30000 }), { organizationId: ORG, branchId: BRANCH, userId: 'user-cajero' });
    // Otra sucursal: no cuenta.
    await enqueueOfflineSale(makeCheckout('s3', now(), { cash: 999, branch: 8 }), { organizationId: ORG, branchId: 8, userId: 'user-cajero' });

    const summary = await CajasService.getCashSummary(session.id);
    expect(summary.sales_cash).toBe(65000); // 50000 - 5000 + 20000
    expect(summary.change_total).toBe(5000);
    expect(summary.sales_by_method).toEqual({ cash: 70000, card: 30000 });
    expect(summary.sales_total).toBe(95000);
    expect(summary.expected_amount).toBe(100000 + 65000 + 10000);

    const closed = await CajasService.closeSession({ final_amount: 170000, notes: 'Cierre sin red' });
    expect(closed.status).toBe('closed');
    expect(closed.pending_sync).toBe(true);
    expect(closed.final_amount).toBe(170000);
    expect(closed.difference).toBe(-5000);
    expect(writes(fake.ops)).toHaveLength(0);

    const close = (await listCashOutbox({ kinds: ['close'] }))[0] as CashCloseRecord;
    expect(close.id).toBe(`close:${session.uuid}`);
    expect(close.session_local_id).toBe(session.id);
    expect(close.payload).toMatchObject({ final_amount: 170000, difference: -5000, closed_by: 'user-cajero', notes: 'Cierre sin red' });
    expect(close.payload.summary.expected_amount).toBe(175000);

    expect(await isCashSessionClosedLocally(ORG, session.uuid)).toBe(true);
    expect(await CajasService.getActiveSession()).toBeNull();
    // Orden de reproducción: apertura → movimiento → cierre.
    expect((await listCashOutbox()).map((r) => r.kind)).toEqual(['open', 'movement', 'close']);
  });

  it('una sesión abierta con red y cerrada sin red: la réplica sigue diciendo open pero getActiveSession devuelve null', async () => {
    const replicaSession = { id: 55, uuid: 'srv-uuid', organization_id: ORG, branch_id: BRANCH, opened_by: 'user-cajero', opened_at: '2026-09-21T08:00:00.000Z', initial_amount: 5000, status: 'open', notes: 'x' };
    fake.setHandler((op) => {
      if (op.table === 'cash_sessions' && op.action === 'select') return { data: op.single ? replicaSession : [replicaSession] };
      if (op.table === 'payments') return { data: [] };
      if (op.table === 'cash_movements') return { data: [] };
      return { data: null, error: op.table === 'returns' || op.table === 'folio_items' ? { message: 'Offline' } : null };
    });
    const closed = await CajasService.closeSession({ final_amount: 5000 });
    expect(closed.id).toBe(55);
    expect(closed.pending_sync).toBe(true);
    expect(writes(fake.ops)).toHaveLength(0);
    const close = (await listCashOutbox({ kinds: ['close'] }))[0] as CashCloseRecord;
    expect(close.session_local_id).toBe(55);
    expect(close.server_id).toBe(55);
    expect(await CajasService.getActiveSession()).toBeNull();
    await expect(CajasService.openSession({ initial_amount: 1 })).resolves.toMatchObject({ status: 'open', pending_sync: true });
  });

  it('cerrar sin caja abierta falla sin encolar', async () => {
    await expect(CajasService.closeSession({ final_amount: 0 })).rejects.toThrow(/No hay sesión de caja abierta/);
    expect(await listCashOutbox()).toHaveLength(0);
  });
});

describe('outboxSalesDeltas / applyOutboxSalesToSummary (puro)', () => {
  const session = { organization_id: ORG, branch_id: BRANCH, opened_at: '2026-09-21T08:00:00.000Z', closed_at: undefined, opened_by: 'user-cajero' };

  it('respeta sucursal, fechas, cajero (modo user) y descuenta el vuelto', async () => {
    const sales = [
      await enqueueOfflineSale(makeCheckout('a', '2026-09-21T09:00:00.000Z', { cash: 10000, change: 1000 }), { organizationId: ORG, branchId: BRANCH, userId: 'user-cajero' }),
      await enqueueOfflineSale(makeCheckout('b', '2026-09-21T07:00:00.000Z', { cash: 5000 }), { organizationId: ORG, branchId: BRANCH, userId: 'user-cajero' }),
      await enqueueOfflineSale(makeCheckout('c', '2026-09-21T10:00:00.000Z', { cash: 3000, userId: 'otro' }), { organizationId: ORG, branchId: BRANCH, userId: 'otro' }),
    ];
    void sales;
    const { listOutboxSales } = await import('../salesOutbox');
    const records = await listOutboxSales();
    const all = outboxSalesDeltas(session, records, { filterByCashier: false, now: '2026-09-21T23:00:00.000Z' });
    expect(all).toEqual({ sales_cash: 12000, change_total: 1000, sales_by_method: { cash: 13000 }, sales_count: 2 });
    const mine = outboxSalesDeltas(session, records, { filterByCashier: true, now: '2026-09-21T23:00:00.000Z' });
    expect(mine).toEqual({ sales_cash: 9000, change_total: 1000, sales_by_method: { cash: 10000 }, sales_count: 1 });
    const global = outboxSalesDeltas({ ...session, branch_id: null }, records, { filterByCashier: false, now: '2026-09-21T23:00:00.000Z' });
    expect(global.sales_count).toBe(2);
  });

  it('aplica los aportes sobre un resumen sin tocar lo que no es venta', () => {
    const base = { ...emptySummary(1000), cash_in: 500, expected_amount: 1500, income_by_method: { card: 10 }, sales_by_method: { card: 10 }, sales_total: 10 };
    const out = applyOutboxSalesToSummary(base, { sales_cash: 900, change_total: 100, sales_by_method: { cash: 1000, card: 200 }, sales_count: 1 });
    expect(out.expected_amount).toBe(2400);
    expect(out.sales_cash).toBe(900);
    expect(out.cash_in).toBe(500);
    expect(out.income_by_method).toEqual({ card: 210, cash: 1000 });
    expect(out.sales_total).toBe(10 + 1200 - 100);
    expect(applyOutboxSalesToSummary(base, { sales_cash: 0, change_total: 0, sales_by_method: {}, sales_count: 0 })).toBe(base);
  });
});

describe('mantenimiento', () => {
  it('la purga solo borra synced antiguos; pending y needs_review nunca', async () => {
    const s = await enqueueCashSessionOpen({ organizationId: ORG, branchId: BRANCH, openedBy: 'u', initialAmount: 1, notes: null });
    await enqueueCashMovement({ session: s, type: 'in', concept: 'a', amount: 1, userId: 'u', notes: null });
    const c = await enqueueCashSessionClose({ session: s, closedBy: 'u', finalAmount: 1, difference: 0, notes: null, summary: emptySummary(1), summaryPartial: false });
    void c;
    const [open, mov, close] = await listCashOutbox();
    const old = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
    await updateCashOutboxRecord(open.id, { status: 'synced', synced_at: old, server_id: 1 });
    await updateCashOutboxRecord(mov.id, { status: 'needs_review', attempts: MAX_ATTEMPTS, last_error: 'x' });
    await updateCashOutboxRecord(close.id, { status: 'synced', synced_at: new Date().toISOString() });
    expect(await pruneSyncedCash()).toBe(1);
    expect((await listCashOutbox()).map((r) => r.kind)).toEqual(['movement', 'close']);
    expect(await countCashNeedingReview()).toBe(1);
  });

  it('getCatalogStatus ignora el estado local de caja guardado en meta', async () => {
    await setCatalogStoreMeta('products', ORG, 1000, 3);
    await enqueueCashSessionOpen({ organizationId: ORG, branchId: BRANCH, openedBy: 'u', initialAmount: 1, notes: null });
    const status = await getCatalogStatus(ORG);
    expect(status.productsCount).toBe(3);
    expect(Object.keys(status.stores)).toEqual(['products']);
    expect(await getLocalCashSessionByUuid(ORG, (await listCashOutbox())[0].session_uuid)).not.toBeNull();
  });

  it('en navegador (o Desktop con red) CajasService no toca el outbox', async () => {
    online = true;
    fake.setHandler((op) => (op.action === 'insert' ? { data: { id: 77, uuid: 'srv', status: 'open', initial_amount: 1, organization_id: ORG, branch_id: BRANCH, opened_by: 'user-cajero', opened_at: 'x' } } : { data: null }));
    const session = await CajasService.openSession({ initial_amount: 1 });
    expect(session.id).toBe(77);
    expect(session.pending_sync).toBeUndefined();
    expect(writes(fake.ops)).toHaveLength(1);
    expect(await listCashOutbox()).toHaveLength(0);
  });
});
