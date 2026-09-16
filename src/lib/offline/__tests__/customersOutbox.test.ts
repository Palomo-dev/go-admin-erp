/**
 * Outbox de clientes del Desktop (fase 4D).
 *
 * Contrato:
 *  - crear sin red → fila en el catálogo local con `pending_sync` y registro
 *    `pending` en el outbox, con el mismo id (UUID generado en el cliente);
 *  - sincronizar: idempotente por id (si ya existe no se inserta), remapeo si
 *    Supabase rechaza por documento/email duplicado (23505) y las ventas
 *    pendientes pasan a apuntar al id real; 5 fallos → `needs_review` sin
 *    borrar nada; «Reintentar» lo vuelve a intentar;
 *  - orden: `salesSync` sincroniza clientes antes que ventas, y una venta
 *    cuyo cliente sigue pendiente no se reproduce.
 *
 * Datos inventados: organización 120, sucursal 7.
 */

jest.mock('@/lib/utils/offlineCache', () => ({ isAppOnline: jest.fn(() => true) }));
jest.mock('@/lib/services/posService', () => ({ POSService: { checkout: jest.fn() } }));
jest.mock('@/lib/utils/desktop', () => ({
  isDesktop: jest.fn(() => true),
  isDesktopOnline: jest.fn(async () => true),
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
import { createFakeSupabase, type FakeOp } from './fakeSupabase';
import { POSService } from '@/lib/services/posService';
import type { CheckoutData } from '@/components/pos/types';
import { closeCatalogDB, deleteCatalogRow, getCatalogRow, putCatalogRows, setCatalogStoreMeta, type CatalogCustomer } from '../catalogStore';
import { __resetOutboxForTests, enqueueOfflineSale, getOutboxSale } from '../salesOutbox';
import {
  MAX_ATTEMPTS,
  computeFullName,
  countPendingCustomers,
  enqueueOfflineCustomer,
  findLocalCustomerDuplicate,
  getOutboxCustomer,
  listOutboxCustomers,
  pruneSyncedCustomers,
  restorePendingCustomersToCatalog,
  updateOutboxCustomer,
  type OfflineCustomerPayload,
} from '../customersOutbox';
import { __resetCustomersSyncForTests, ensureCustomerSynced, retryOutboxCustomer, syncPendingCustomers } from '../customersSync';
import { __resetSalesSyncForTests, syncPendingSales } from '../salesSync';
import { posOfflineReads } from '../posOfflineReads';

const ORG = 120;
const BRANCH = 7;
const LOCAL_ID = '11111111-1111-4111-8111-111111111111';
const EXISTING_ID = '99999999-9999-4999-8999-999999999999';
const checkoutMock = POSService.checkout as jest.Mock;

function payload(overrides: Partial<OfflineCustomerPayload> = {}): OfflineCustomerPayload {
  return {
    organization_id: ORG,
    branch_id: BRANCH,
    first_name: 'Ana',
    last_name: 'Pérez',
    email: 'ana@example.test',
    phone: '3000000000',
    identification_type: 'CC',
    identification_number: '1234567890',
    address: null,
    customer_type: 'person',
    company_name: null,
    roles: ['cliente'],
    tags: [],
    preferences: {},
    fiscal_responsibilities: ['R-99-PN'],
    fiscal_municipality_id: null,
    metadata: { created_offline: true },
    created_at: '2026-09-16T10:00:00.000Z',
    ...overrides,
  };
}

function makeCheckout(saleId: string, customerId: string | undefined, createdAt = '2026-09-16T10:05:00.000Z'): CheckoutData {
  return {
    cart: {
      id: `cart-${saleId}`,
      organization_id: ORG,
      branch_id: BRANCH,
      customer_id: customerId,
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

/** Supabase de mentira con una tabla `customers` en memoria y UNIQUE por documento/email. */
function fakeCustomersDb(seed: Array<{ id: string; organization_id: number; identification_number?: string | null; email?: string | null }> = []) {
  const rows = [...seed];
  const fake = createFakeSupabase((op: FakeOp) => {
    if (op.table !== 'customers') return { data: null };
    if (op.action === 'insert') {
      const row = op.payload as { id: string; organization_id: number; identification_number?: string | null; email?: string | null };
      const clash = rows.find(
        (r) =>
          r.organization_id === row.organization_id &&
          (r.id === row.id ||
            (row.identification_number && r.identification_number === row.identification_number) ||
            (row.email && r.email === row.email)),
      );
      if (clash) return { error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
      rows.push(row);
      return { data: row };
    }
    if (op.action === 'select') {
      const f = op.filters;
      const found = rows.find(
        (r) =>
          (f.id === undefined || r.id === f.id) &&
          (f.organization_id === undefined || r.organization_id === f.organization_id) &&
          (f.identification_number === undefined || r.identification_number === f.identification_number) &&
          (f.email === undefined || r.email === f.email),
      );
      return { data: found ? { id: found.id } : null };
    }
    return { data: null };
  });
  return { fake, rows };
}

describe('customersOutbox', () => {
  beforeEach(async () => {
    freshIndexedDb();
    __resetOutboxForTests();
    __resetCustomersSyncForTests();
    __resetSalesSyncForTests();
    await closeCatalogDB();
    installWindow({ desktop: true });
    checkoutMock.mockReset();
    checkoutMock.mockResolvedValue({ id: 'sale' });
    await setCatalogStoreMeta('products', ORG, Date.now(), 1);
    await setCatalogStoreMeta('customers', ORG, Date.now(), 0);
  });

  afterEach(async () => {
    await closeCatalogDB();
    uninstallWindow();
  });

  it('computeFullName reproduce la columna generada', () => {
    expect(computeFullName({ customer_type: 'person', first_name: 'Ana', last_name: 'Pérez', company_name: null })).toBe('Ana Pérez');
    expect(computeFullName({ customer_type: 'person', first_name: '', last_name: '', company_name: null })).toBeNull();
    expect(computeFullName({ customer_type: 'company', first_name: '', last_name: '', company_name: 'Zapatería SAS' })).toBe('Zapatería SAS');
    expect(computeFullName({ customer_type: 'company', first_name: 'Luis', last_name: 'Gómez', company_name: '' })).toBe('Luis Gómez');
    expect(computeFullName({ customer_type: 'company', first_name: '', last_name: '', company_name: null })).toBe('Empresa sin nombre');
  });

  it('crear sin red: fila en el catálogo local con pending_sync y registro pending en el outbox, mismo id', async () => {
    const row = await enqueueOfflineCustomer(payload(), LOCAL_ID);
    expect(row.id).toBe(LOCAL_ID);
    expect(row.full_name).toBe('Ana Pérez');
    expect(row.doc_type).toBe('CC');
    expect(row.doc_number).toBe('1234567890');
    expect(row.pending_sync).toBe(true);

    const inCatalog = await getCatalogRow('customers', LOCAL_ID);
    expect(inCatalog?.pending_sync).toBe(true);
    expect(inCatalog?.organization_id).toBe(ORG);

    const record = await getOutboxCustomer(LOCAL_ID);
    expect(record?.status).toBe('pending');
    expect(record?.attempts).toBe(0);
    expect(record?.server_id).toBeNull();
    expect(record?.payload).not.toHaveProperty('full_name');
    expect(record?.payload).not.toHaveProperty('doc_type');
    expect(await countPendingCustomers()).toBe(1);

    // El selector del POS lo encuentra por nombre, email, teléfono y documento.
    for (const term of ['ana', 'ANA@example', '3000000000', '1234567890']) {
      const found = await posOfflineReads.searchCustomers(ORG, term);
      expect(found.map((c) => c.id)).toEqual([LOCAL_ID]);
    }
    // Y `setCartCustomer` lo obtiene del catálogo local.
    expect((await posOfflineReads.getCustomerById(ORG, LOCAL_ID)).pending_sync).toBe(true);
  });

  it('detecta duplicados locales por documento o email (mismos UNIQUE que Postgres)', async () => {
    await putCatalogRows('customers', [
      {
        id: EXISTING_ID,
        organization_id: ORG,
        branch_id: BRANCH,
        first_name: 'Carlos',
        last_name: 'Ruiz',
        full_name: 'Carlos Ruiz',
        email: 'carlos@example.test',
        phone: null,
        doc_type: 'CC',
        doc_number: '555',
        identification_type: 'CC',
        identification_number: '555',
        company_name: null,
        trade_name: null,
        address: null,
        city: null,
        customer_type: 'person',
        avatar_url: null,
        roles: [],
        tags: [],
        preferences: {},
        fiscal_municipality_id: null,
        created_at: null,
        updated_at: null,
      } satisfies CatalogCustomer,
    ]);
    expect((await findLocalCustomerDuplicate(ORG, { identification_number: '555' }))?.id).toBe(EXISTING_ID);
    expect((await findLocalCustomerDuplicate(ORG, { email: 'CARLOS@example.test ' }))?.id).toBe(EXISTING_ID);
    expect(await findLocalCustomerDuplicate(ORG, { identification_number: '556', email: 'otro@example.test' })).toBeNull();
    expect(await findLocalCustomerDuplicate(999, { identification_number: '555' })).toBeNull();
    expect(await findLocalCustomerDuplicate(ORG, {})).toBeNull();
  });

  describe('sincronización', () => {
    it('inserta con el id local, marca synced y quita pending_sync del catálogo', async () => {
      await enqueueOfflineCustomer(payload(), LOCAL_ID);
      const { fake, rows } = fakeCustomersDb();
      const NOW = Date.now();
      const result = await syncPendingCustomers({ client: fake.client, now: () => NOW });
      expect(result).toEqual({ synced: 1, remapped: 0, failed: 0, needsReview: 0, skipped: 0 });
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(LOCAL_ID);
      const insert = fake.ops.find((o) => o.action === 'insert');
      expect((insert?.payload as Record<string, unknown>).first_name).toBe('Ana');
      expect(insert?.payload).not.toHaveProperty('full_name');

      const record = await getOutboxCustomer(LOCAL_ID);
      expect(record?.status).toBe('synced');
      expect(record?.server_id).toBe(LOCAL_ID);
      expect(record?.synced_at).toBe(new Date(NOW).toISOString());
      expect((await getCatalogRow('customers', LOCAL_ID))?.pending_sync).toBe(false);
    });

    it('idempotente: si el cliente ya existe por id no vuelve a insertar', async () => {
      await enqueueOfflineCustomer(payload(), LOCAL_ID);
      const { fake, rows } = fakeCustomersDb([{ id: LOCAL_ID, organization_id: ORG, identification_number: '1234567890', email: 'ana@example.test' }]);
      const result = await syncPendingCustomers({ client: fake.client });
      expect(result.synced).toBe(1);
      expect(rows).toHaveLength(1);
      expect(fake.ops.filter((o) => o.action === 'insert')).toHaveLength(0);
      expect((await getOutboxCustomer(LOCAL_ID))?.status).toBe('synced');
    });

    it('cliente que ya existía por documento: remapea el id y las ventas pendientes apuntan al real', async () => {
      await enqueueOfflineCustomer(payload(), LOCAL_ID);
      await enqueueOfflineSale(makeCheckout('sale-1', LOCAL_ID), { organizationId: ORG, branchId: BRANCH, userId: 'u' });
      await enqueueOfflineSale(makeCheckout('sale-2', 'otro-cliente', '2026-09-16T10:06:00.000Z'), { organizationId: ORG, branchId: BRANCH, userId: 'u' });
      const { fake, rows } = fakeCustomersDb([{ id: EXISTING_ID, organization_id: ORG, identification_number: '1234567890', email: 'otro@example.test' }]);

      const result = await syncPendingCustomers({ client: fake.client });
      expect(result).toEqual({ synced: 1, remapped: 1, failed: 0, needsReview: 0, skipped: 0 });
      expect(rows).toHaveLength(1); // no se creó un duplicado

      const record = await getOutboxCustomer(LOCAL_ID);
      expect(record?.status).toBe('synced');
      expect(record?.server_id).toBe(EXISTING_ID);

      expect((await getOutboxSale('sale-1'))?.envelope.checkout.cart.customer_id).toBe(EXISTING_ID);
      expect((await getOutboxSale('sale-2'))?.envelope.checkout.cart.customer_id).toBe('otro-cliente');

      // El catálogo local ya no tiene la fila provisional; sí la del id real.
      expect(await getCatalogRow('customers', LOCAL_ID)).toBeUndefined();
      expect((await getCatalogRow('customers', EXISTING_ID))?.pending_sync).toBe(false);
      expect(await ensureCustomerSynced(LOCAL_ID)).toEqual({ kind: 'synced', serverId: EXISTING_ID });
    });

    it('5 fallos → needs_review con el error, sin borrar; «Reintentar» lo vuelve a intentar', async () => {
      await enqueueOfflineCustomer(payload(), LOCAL_ID);
      let failing = true;
      const fake = createFakeSupabase((op: FakeOp) => {
        if (op.action === 'insert') return failing ? { error: { code: '42501', message: 'permission denied' } } : { data: op.payload };
        return { data: null };
      });
      for (let i = 1; i <= MAX_ATTEMPTS; i++) {
        const r = await syncPendingCustomers({ client: fake.client, force: true, now: () => i * 1_000 });
        expect(r.failed + r.needsReview).toBe(1);
      }
      const record = await getOutboxCustomer(LOCAL_ID);
      expect(record?.status).toBe('needs_review');
      expect(record?.attempts).toBe(MAX_ATTEMPTS);
      expect(record?.last_error).toContain('42501');
      expect(record?.payload.first_name).toBe('Ana');
      expect(await listOutboxCustomers()).toHaveLength(1);
      // El catálogo local lo sigue mostrando como pendiente.
      expect((await getCatalogRow('customers', LOCAL_ID))?.pending_sync).toBe(true);

      failing = false;
      const retry = await retryOutboxCustomer(LOCAL_ID, fake.client);
      expect(retry.synced).toBe(1);
      expect((await getOutboxCustomer(LOCAL_ID))?.status).toBe('synced');
    });

    it('respeta el backoff salvo con force', async () => {
      await enqueueOfflineCustomer(payload(), LOCAL_ID);
      await updateOutboxCustomer(LOCAL_ID, { attempts: 1, next_attempt_at: 10_000 });
      const { fake } = fakeCustomersDb();
      expect((await syncPendingCustomers({ client: fake.client, now: () => 5_000 })).skipped).toBe(1);
      expect((await syncPendingCustomers({ client: fake.client, now: () => 5_000, force: true })).synced).toBe(1);
    });

    it('purga solo synced con más de 7 días', async () => {
      await enqueueOfflineCustomer(payload(), LOCAL_ID);
      await enqueueOfflineCustomer(payload({ identification_number: '2', email: 'b@example.test' }), '22222222-2222-4222-8222-222222222222');
      const old = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
      await updateOutboxCustomer(LOCAL_ID, { status: 'synced', synced_at: old });
      await updateOutboxCustomer('22222222-2222-4222-8222-222222222222', { status: 'needs_review', last_error: 'x' });
      expect(await pruneSyncedCustomers()).toBe(1);
      expect((await listOutboxCustomers()).map((r) => r.status)).toEqual(['needs_review']);
    });

    it('restorePendingCustomersToCatalog devuelve al catálogo los pendientes que la poda retiró', async () => {
      await enqueueOfflineCustomer(payload(), LOCAL_ID);
      // Simular la poda de la replicación.
      await deleteCatalogRow('customers', LOCAL_ID);
      expect(await getCatalogRow('customers', LOCAL_ID)).toBeUndefined();
      expect(await restorePendingCustomersToCatalog(ORG)).toBe(1);
      expect((await getCatalogRow('customers', LOCAL_ID))?.pending_sync).toBe(true);
      expect(await restorePendingCustomersToCatalog(999)).toBe(0);
    });
  });

  describe('orden clientes → ventas (salesSync)', () => {
    it('sincroniza el cliente antes de reproducir la venta que lo usa', async () => {
      await enqueueOfflineCustomer(payload(), LOCAL_ID);
      await enqueueOfflineSale(makeCheckout('sale-1', LOCAL_ID), { organizationId: ORG, branchId: BRANCH, userId: 'u' });
      const { fake, rows } = fakeCustomersDb();
      const order: string[] = [];
      fake.setHandler((op: FakeOp) => {
        if (op.table === 'customers' && op.action === 'insert') {
          order.push('customer');
          rows.push(op.payload as never);
          return { data: op.payload };
        }
        return { data: null };
      });
      checkoutMock.mockImplementation(async () => {
        order.push('sale');
        return { id: 'sale-1' };
      });
      // `syncPendingSales` usa el cliente por defecto de customersSync (mockeado
      // arriba para fallar): se sincroniza el cliente explícitamente primero,
      // como hace `runSync` internamente, para fijar el orden.
      await syncPendingCustomers({ client: fake.client });
      const result = await syncPendingSales();
      expect(order).toEqual(['customer', 'sale']);
      expect(result.synced).toBe(1);
      expect((await getOutboxSale('sale-1'))?.status).toBe('synced');
    });

    it('una venta cuyo cliente sigue pendiente no se reproduce ni consume intentos', async () => {
      await enqueueOfflineCustomer(payload(), LOCAL_ID);
      // El cliente falla al sincronizar (el cliente por defecto de Supabase está mockeado para lanzar).
      await enqueueOfflineSale(makeCheckout('sale-1', LOCAL_ID), { organizationId: ORG, branchId: BRANCH, userId: 'u' });
      await enqueueOfflineSale(makeCheckout('sale-2', undefined, '2026-09-16T10:06:00.000Z'), { organizationId: ORG, branchId: BRANCH, userId: 'u' });

      const result = await syncPendingSales();
      expect(checkoutMock).toHaveBeenCalledTimes(1); // solo la venta sin cliente pendiente
      expect(result.synced).toBe(1);
      const sale1 = await getOutboxSale('sale-1');
      expect(sale1?.status).toBe('pending');
      expect(sale1?.attempts).toBe(0);
      expect(sale1?.last_error).toContain('cliente pendiente');
      const customer = await getOutboxCustomer(LOCAL_ID);
      expect(customer?.status).toBe('pending');
      // Sí se intentó (cliente por defecto cargado bajo demanda) y falló con el mock.
      expect(customer?.attempts).toBeGreaterThanOrEqual(1);
      expect(customer?.last_error).toContain('no debe usarse en tests');
    });

    it('cliente en needs_review → la venta falla con ese motivo', async () => {
      await enqueueOfflineCustomer(payload(), LOCAL_ID);
      await updateOutboxCustomer(LOCAL_ID, { status: 'needs_review', attempts: MAX_ATTEMPTS, last_error: 'permission denied' });
      await enqueueOfflineSale(makeCheckout('sale-1', LOCAL_ID), { organizationId: ORG, branchId: BRANCH, userId: 'u' });
      const result = await syncPendingSales();
      expect(checkoutMock).not.toHaveBeenCalled();
      expect(result.failed).toBe(1);
      const sale1 = await getOutboxSale('sale-1');
      expect(sale1?.attempts).toBe(1);
      expect(sale1?.last_error).toContain('requiere revisión');
      expect(sale1?.last_error).toContain('permission denied');
    });
  });
});
