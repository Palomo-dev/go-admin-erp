/**
 * Sincronización del outbox de caja (fase 4F).
 *
 * Contrato:
 *  - apertura: INSERT en `cash_sessions` con el `uuid` del cliente; el id
 *    serial que devuelve Supabase queda en `server_id` y la sesión local pasa
 *    de id negativo a ese id (remapeo);
 *  - idempotente por uuid: si ya existe no se inserta; `23505` → releer;
 *  - movimientos y cierre resuelven el id real por `session_uuid`; si la
 *    apertura aún no entró se quedan `pending` SIN consumir intentos;
 *  - orden apertura → movimientos → cierre; el cierre hace UPDATE por el id
 *    real y retira el estado local; si ya estaba `closed`, se da por hecho;
 *  - 5 fallos → `needs_review` sin borrar; «Reintentar» reproduce todo en
 *    orden; sin red no se intenta nada.
 *
 * Datos inventados: organización 120, sucursal 7.
 */

let online = true;
jest.mock('@/lib/utils/offlineCache', () => ({ isAppOnline: jest.fn(() => online) }));
jest.mock('@/lib/utils/desktop', () => ({
  isDesktop: jest.fn(() => true),
  isDesktopOnline: jest.fn(async () => online),
  onDesktopConnectivity: jest.fn(() => () => {}),
}));
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: () => {
      throw new Error('el cliente real de Supabase no debe usarse en tests');
    },
  },
}));

jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});

import { installWindow, uninstallWindow, freshIndexedDb } from './testEnv';
import { createFakeSupabase, writesTo, type FakeOp } from './fakeSupabase';
import { closeCatalogDB } from '../catalogStore';
import {
  MAX_ATTEMPTS,
  __resetCashOutboxForTests,
  enqueueCashMovement,
  enqueueCashSessionClose,
  enqueueCashSessionOpen,
  getCashOutboxRecord,
  getLocalCashSessionByUuid,
  listCashOutbox,
  updateCashOutboxRecord,
} from '../cashOutbox';
import {
  WAITING_FOR_OPENING_MESSAGE,
  __resetCashSyncForTests,
  backoffMs,
  resolveSessionServerId,
  retryCashOutboxRecord,
  syncCashMovementsAndClosings,
  syncCashOpenings,
  syncPendingCash,
} from '../cashSync';
import type { CashSummary } from '@/components/pos/cajas/types';

const ORG = 120;
const BRANCH = 7;

const summary: CashSummary = {
  initial_amount: 1000,
  sales_cash: 500,
  cash_in: 0,
  cash_out: 0,
  expected_amount: 1500,
  change_total: 0,
  returns_total: 0,
  folio_consumptions_total: 0,
  cash_receipts_total: 0,
  purchases_total: 0,
};

/** Servidor de mentira: `cash_sessions` y `cash_movements` con serial e índice UNIQUE por uuid. */
function makeServer() {
  const sessions = new Map<string, { id: number; uuid: string; status: string; [k: string]: unknown }>();
  const movements = new Map<string, { id: number; uuid: string; [k: string]: unknown }>();
  let nextSession = 100;
  let nextMovement = 500;
  const fake = createFakeSupabase((op: FakeOp) => {
    if (op.table === 'cash_sessions') {
      if (op.action === 'select') {
        const byUuid = op.filters.uuid ? sessions.get(String(op.filters.uuid)) : undefined;
        const byId = op.filters.id !== undefined ? Array.from(sessions.values()).find((s) => s.id === Number(op.filters.id)) : undefined;
        const row = byUuid ?? byId ?? null;
        return { data: row ? { id: row.id, status: row.status } : null };
      }
      if (op.action === 'insert') {
        const p = op.payload as { uuid: string };
        if (sessions.has(p.uuid)) return { error: { code: '23505', message: 'duplicate key value violates unique constraint "idx_cash_sessions_uuid"' } };
        const row = { ...p, id: nextSession++, status: 'open' };
        sessions.set(p.uuid, row);
        return { data: { id: row.id, status: row.status } };
      }
      if (op.action === 'update') {
        const row = Array.from(sessions.values()).find((s) => s.id === Number(op.filters.id));
        if (!row) return { error: { message: 'not found' } };
        Object.assign(row, op.payload as object);
        return { data: null };
      }
    }
    if (op.table === 'cash_movements') {
      if (op.action === 'select') {
        const row = movements.get(String(op.filters.uuid));
        return { data: row ? { id: row.id } : null };
      }
      if (op.action === 'insert') {
        const p = op.payload as { uuid: string };
        if (movements.has(p.uuid)) return { error: { code: '23505', message: 'duplicate key' } };
        const row = { ...p, id: nextMovement++ };
        movements.set(p.uuid, row);
        return { data: { id: row.id } };
      }
    }
    return { data: null };
  });
  return { fake, sessions, movements };
}

async function seedFullDay() {
  const session = await enqueueCashSessionOpen({ organizationId: ORG, branchId: BRANCH, openedBy: 'user-cajero', initialAmount: 1000, notes: 'Apertura' });
  const mov = await enqueueCashMovement({ session, type: 'in', concept: 'Cambio', amount: 200, userId: 'user-cajero', notes: null });
  const closed = await enqueueCashSessionClose({ session, closedBy: 'user-cajero', finalAmount: 1700, difference: 0, notes: 'Cierre', summary, summaryPartial: false });
  return { session, mov, closed };
}

beforeEach(async () => {
  online = true;
  freshIndexedDb();
  installWindow({ desktop: true });
  await __resetCashOutboxForTests();
  await closeCatalogDB();
  __resetCashSyncForTests();
});

afterEach(() => {
  uninstallWindow();
});

describe('apertura', () => {
  it('inserta con el uuid del cliente, guarda el id serial y remapea la sesión local', async () => {
    const { fake, sessions } = makeServer();
    const session = await enqueueCashSessionOpen({ organizationId: ORG, branchId: BRANCH, openedBy: 'user-cajero', initialAmount: 1000, notes: null });
    expect(session.id).toBeLessThan(0);

    const result = await syncCashOpenings({ client: fake.client });
    expect(result).toEqual({ synced: 1, failed: 0, needsReview: 0, skipped: 0 });

    const inserts = writesTo(fake.ops, 'cash_sessions');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload).toMatchObject({ uuid: session.uuid, organization_id: ORG, branch_id: BRANCH, opened_by: 'user-cajero', initial_amount: 1000, status: 'open' });
    expect(sessions.get(session.uuid)?.id).toBe(100);

    const record = await getCashOutboxRecord(session.uuid);
    expect(record).toMatchObject({ status: 'synced', server_id: 100 });
    const local = await getLocalCashSessionByUuid(ORG, session.uuid);
    expect(local?.session.id).toBe(100);
    expect(local?.session.pending_sync).toBe(false);
  });

  it('es idempotente por uuid: si ya existe no inserta; 23505 → relee', async () => {
    const { fake, sessions } = makeServer();
    const session = await enqueueCashSessionOpen({ organizationId: ORG, branchId: BRANCH, openedBy: 'u', initialAmount: 1, notes: null });
    sessions.set(session.uuid, { id: 42, uuid: session.uuid, status: 'open' });
    await syncCashOpenings({ client: fake.client });
    expect(writesTo(fake.ops, 'cash_sessions')).toHaveLength(0);
    expect((await getCashOutboxRecord(session.uuid))?.server_id).toBe(42);

    // Carrera: el SELECT previo no la ve (otro equipo la inserta justo después) y el INSERT choca con 23505.
    const other = await enqueueCashSessionOpen({ organizationId: ORG, branchId: 8, openedBy: 'u', initialAmount: 1, notes: null });
    let selects = 0;
    const racing = createFakeSupabase((op: FakeOp) => {
      if (op.table !== 'cash_sessions') return { data: null };
      if (op.action === 'select') {
        selects++;
        if (selects === 1) return { data: null };
        return { data: { id: 43, status: 'open' } };
      }
      if (op.action === 'insert') return { error: { code: '23505', message: 'duplicate key value violates unique constraint "idx_cash_sessions_uuid"' } };
      return { data: null };
    });
    await syncCashOpenings({ client: racing.client, force: true });
    expect((await getCashOutboxRecord(other.uuid))?.server_id).toBe(43);
    expect((await getCashOutboxRecord(other.uuid))?.status).toBe('synced');
  });
});

describe('movimientos y cierre', () => {
  it('esperan a la apertura sin consumir intentos; luego entran con el id real y en orden', async () => {
    const { fake, sessions, movements } = makeServer();
    const { session, mov } = await seedFullDay();

    const early = await syncCashMovementsAndClosings({ client: fake.client });
    expect(early).toEqual({ synced: 0, failed: 0, needsReview: 0, skipped: 2 });
    const waiting = await getCashOutboxRecord(mov.uuid as string);
    expect(waiting).toMatchObject({ status: 'pending', attempts: 0, last_error: WAITING_FOR_OPENING_MESSAGE });
    expect(writesTo(fake.ops, 'cash_movements')).toHaveLength(0);
    expect(writesTo(fake.ops, 'cash_sessions')).toHaveLength(0);

    await syncCashOpenings({ client: fake.client });
    const serverId = sessions.get(session.uuid)!.id;
    expect(await resolveSessionServerId((await getCashOutboxRecord(mov.uuid as string)) as never)).toBe(serverId);

    const later = await syncCashMovementsAndClosings({ client: fake.client });
    expect(later).toEqual({ synced: 2, failed: 0, needsReview: 0, skipped: 0 });

    const movInsert = writesTo(fake.ops, 'cash_movements')[0];
    expect(movInsert.payload).toMatchObject({ uuid: mov.uuid, cash_session_id: serverId, type: 'in', concept: 'Cambio', amount: 200, user_id: 'user-cajero', branch_id: BRANCH });
    expect(movements.get(mov.uuid as string)?.id).toBe(500);

    const closeUpdate = writesTo(fake.ops, 'cash_sessions').find((o) => o.action === 'update')!;
    expect(closeUpdate.filters).toMatchObject({ id: serverId, organization_id: ORG });
    expect(closeUpdate.payload).toMatchObject({ status: 'closed', final_amount: 1700, difference: 0, closed_by: 'user-cajero', notes: 'Cierre' });
    expect(sessions.get(session.uuid)?.status).toBe('closed');

    // Orden de escritura: apertura → movimiento → cierre.
    const order = fake.ops.filter((o) => o.action === 'insert' || o.action === 'update').map((o) => `${o.action}:${o.table}`);
    expect(order).toEqual(['insert:cash_sessions', 'insert:cash_movements', 'update:cash_sessions']);

    // Estado local retirado tras el cierre; todo synced con su id real.
    expect(await getLocalCashSessionByUuid(ORG, session.uuid)).toBeNull();
    const all = await listCashOutbox();
    expect(all.map((r) => [r.kind, r.status, r.server_id])).toEqual([
      ['open', 'synced', serverId],
      ['movement', 'synced', 500],
      ['close', 'synced', serverId],
    ]);
  });

  it('syncPendingCash reproduce todo en una pasada y no duplica al repetir', async () => {
    const { fake, movements } = makeServer();
    await seedFullDay();
    expect(await syncPendingCash({ client: fake.client })).toEqual({ synced: 3, failed: 0, needsReview: 0, skipped: 0 });
    fake.reset();
    expect(await syncPendingCash({ client: fake.client })).toEqual({ synced: 0, failed: 0, needsReview: 0, skipped: 0 });
    expect(fake.ops).toHaveLength(0);
    expect(movements.size).toBe(1);
  });

  it('un cierre sobre una sesión que ya está closed en el servidor se da por hecho sin UPDATE', async () => {
    const { fake, sessions } = makeServer();
    sessions.set('srv-uuid', { id: 77, uuid: 'srv-uuid', status: 'closed' });
    const session = { id: 77, uuid: 'srv-uuid', organization_id: ORG, branch_id: BRANCH, opened_by: 'u', opened_at: 'x', initial_amount: 1, status: 'open' as const, created_at: 'x', updated_at: 'x' };
    await enqueueCashSessionClose({ session, closedBy: 'u', finalAmount: 1, difference: 0, notes: null, summary, summaryPartial: false });
    const result = await syncCashMovementsAndClosings({ client: fake.client });
    expect(result.synced).toBe(1);
    expect(writesTo(fake.ops, 'cash_sessions')).toHaveLength(0);
  });

  it('un movimiento de una sesión abierta con red (id positivo) no espera a nada', async () => {
    const { fake } = makeServer();
    const session = { id: 77, uuid: 'srv-uuid', organization_id: ORG, branch_id: BRANCH };
    const mov = await enqueueCashMovement({ session, type: 'out', concept: 'Retiro', amount: 50, userId: 'u', notes: 'x' });
    expect(await syncCashMovementsAndClosings({ client: fake.client })).toMatchObject({ synced: 1 });
    expect(writesTo(fake.ops, 'cash_movements')[0].payload).toMatchObject({ uuid: mov.uuid, cash_session_id: 77 });
  });
});

describe('fallos, revisión y reintento', () => {
  it('5 fallos → needs_review con el error, sin borrar nada; backoff creciente', async () => {
    const failing = createFakeSupabase((op) => (op.action === 'insert' ? { error: { code: '42501', message: 'permission denied' } } : { data: null }));
    const session = await enqueueCashSessionOpen({ organizationId: ORG, branchId: BRANCH, openedBy: 'u', initialAmount: 1, notes: null });
    let now = Date.parse('2026-09-21T12:00:00.000Z');
    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      const r = await syncCashOpenings({ client: failing.client, now: () => now, force: true });
      const rec = (await getCashOutboxRecord(session.uuid))!;
      if (i < MAX_ATTEMPTS) {
        expect(r.failed).toBe(1);
        expect(rec.status).toBe('pending');
        expect(rec.attempts).toBe(i);
        expect(rec.next_attempt_at).toBe(now + backoffMs(i));
      } else {
        expect(r.needsReview).toBe(1);
        expect(rec.status).toBe('needs_review');
        expect(rec.last_error).toContain('permission denied');
      }
      now += 1;
    }
    expect(await listCashOutbox()).toHaveLength(1);
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(4)).toBe(240_000);
    expect(backoffMs(9)).toBe(600_000);

    // Sin `force`, el backoff se respeta.
    await updateCashOutboxRecord(session.uuid, { status: 'pending', next_attempt_at: now + 60_000 });
    expect(await syncCashOpenings({ client: failing.client, now: () => now })).toMatchObject({ skipped: 1, failed: 0 });
  });

  it('«Reintentar» vuelve a pending con intentos a cero y reproduce todo en orden', async () => {
    const { fake } = makeServer();
    const { session, mov } = await seedFullDay();
    await updateCashOutboxRecord(mov.uuid as string, { status: 'needs_review', attempts: MAX_ATTEMPTS, last_error: 'x' });
    const result = await retryCashOutboxRecord(mov.uuid as string, fake.client);
    expect(result.synced).toBe(3);
    expect((await getCashOutboxRecord(mov.uuid as string))).toMatchObject({ status: 'synced', attempts: 0 });
    expect((await getCashOutboxRecord(session.uuid))?.status).toBe('synced');
  });

  it('sin red no se intenta nada (skipped) y los syncing huérfanos se reintentan al volver', async () => {
    const { fake } = makeServer();
    const session = await enqueueCashSessionOpen({ organizationId: ORG, branchId: BRANCH, openedBy: 'u', initialAmount: 1, notes: null });
    await updateCashOutboxRecord(session.uuid, { status: 'syncing' });
    online = false;
    expect(await syncCashOpenings({ client: fake.client })).toEqual({ synced: 0, failed: 0, needsReview: 0, skipped: 1 });
    expect(fake.ops).toHaveLength(0);
    online = true;
    expect(await syncCashOpenings({ client: fake.client })).toMatchObject({ synced: 1 });
  });

  it('dos llamadas concurrentes comparten la misma sincronización', async () => {
    const { fake } = makeServer();
    await seedFullDay();
    const [a, b] = await Promise.all([syncPendingCash({ client: fake.client }), syncPendingCash({ client: fake.client })]);
    expect(a).toBe(b);
    expect(fake.ops.filter((o) => o.action === 'insert')).toHaveLength(2);
  });
});
