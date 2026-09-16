/**
 * Cliente en el carrito sin red (fase 4D) — `POSService.setCartCustomer` y
 * `POSService.createCustomer` en Go Admin Desktop sin conectividad.
 *
 * Contrato:
 *  - Desktop sin red: `setCartCustomer` toma el cliente del catálogo local y
 *    no emite ninguna operación a Supabase; si no está, error claro.
 *  - Desktop sin red: `createCustomer` genera el id (uuid), guarda en el
 *    catálogo local con `pending_sync`, encola en el outbox y no toca
 *    Supabase; rechaza duplicados por documento/email; escribe `first_name`/
 *    `last_name` e `identification_*` (nunca las columnas generadas).
 *  - Navegador (o Desktop con red): comportamiento de siempre.
 *
 * Datos inventados: organización 120, sucursal 7.
 */

import { createFakeSupabase, type FakeOp } from './fakeSupabase';

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
jest.mock('@/lib/services/stockMovementService', () => ({ stockMovementService: {} }));
jest.mock('@/lib/services/serialTrackingService', () => ({ serialTrackingService: {} }));
jest.mock('@/lib/services/promotionEngine', () => ({ promotionEngine: {} }));
jest.mock('@/lib/pos/display/posDisplay', () => ({ getPosDisplayEmitter: () => ({ onCartsSaved: jest.fn(), setMode: jest.fn() }) }));
jest.mock('@/lib/utils/offlineCache', () => ({ isAppOnline: jest.fn(() => true) }));

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

import { installWindow, uninstallWindow, freshIndexedDb } from './testEnv';
import { isAppOnline } from '@/lib/utils/offlineCache';
import { POSService } from '@/lib/services/posService';
import { closeCatalogDB, getCatalogRow, putCatalogRows, setCatalogStoreMeta, type CatalogCustomer } from '../catalogStore';
import { __resetOutboxForTests } from '../salesOutbox';
import { getOutboxCustomer, listOutboxCustomers } from '../customersOutbox';
import { CUSTOMER_NOT_IN_CATALOG_MESSAGE } from '../posOfflineReads';

const isAppOnlineMock = isAppOnline as jest.Mock;
const ORG = 120;
const CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function catalogCustomer(overrides: Partial<CatalogCustomer> = {}): CatalogCustomer {
  return {
    id: CUSTOMER_ID,
    organization_id: ORG,
    branch_id: 7,
    first_name: 'Laura',
    last_name: 'Mora',
    full_name: 'Laura Mora',
    email: 'laura@example.test',
    phone: '3111111111',
    doc_type: 'CC',
    doc_number: '1010',
    identification_type: 'CC',
    identification_number: '1010',
    company_name: null,
    trade_name: null,
    address: null,
    city: null,
    customer_type: 'person',
    avatar_url: null,
    roles: ['cliente'],
    tags: [],
    preferences: {},
    fiscal_municipality_id: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

function seedCart() {
  localStorage.setItem('pos_carts_120', JSON.stringify([{ id: 'cart-1', organization_id: ORG, branch_id: 7, status: 'active', items: [] }]));
}

async function seedCatalog() {
  await setCatalogStoreMeta('products', ORG, Date.now(), 1);
  await setCatalogStoreMeta('customers', ORG, Date.now(), 1);
  await putCatalogRows('customers', [catalogCustomer()]);
}

describe('POSService — cliente en el carrito sin red (fase 4D)', () => {
  beforeEach(async () => {
    freshIndexedDb();
    __resetOutboxForTests();
    await closeCatalogDB();
    fake.reset();
    fake.setHandler(() => ({ data: null }));
    installWindow({ desktop: true });
    seedCart();
    isAppOnlineMock.mockReturnValue(false);
    await seedCatalog();
  });

  afterEach(async () => {
    await closeCatalogDB();
    uninstallWindow();
  });

  describe('setCartCustomer', () => {
    it('Desktop sin red: toma el cliente del catálogo local y no consulta Supabase', async () => {
      const cart = await POSService.setCartCustomer('cart-1', CUSTOMER_ID);
      expect(cart.customer_id).toBe(CUSTOMER_ID);
      expect(cart.customer?.full_name).toBe('Laura Mora');
      expect(fake.ops).toHaveLength(0);
      // Persistido en el carrito local.
      const stored = JSON.parse(localStorage.getItem('pos_carts_120') as string);
      expect(stored[0].customer.id).toBe(CUSTOMER_ID);
    });

    it('Desktop sin red: cliente creado sin red (pending_sync) también se asigna', async () => {
      await putCatalogRows('customers', [catalogCustomer({ id: 'local-1', full_name: 'Nuevo Local', pending_sync: true })]);
      const cart = await POSService.setCartCustomer('cart-1', 'local-1');
      expect(cart.customer?.pending_sync).toBe(true);
      expect(fake.ops).toHaveLength(0);
    });

    it('Desktop sin red: si el cliente no está en el catálogo local, error claro y sin consultas', async () => {
      await expect(POSService.setCartCustomer('cart-1', 'no-existe')).rejects.toThrow(CUSTOMER_NOT_IN_CATALOG_MESSAGE);
      expect(fake.ops).toHaveLength(0);
    });

    it('Desktop sin red: cliente de otra organización no se asigna', async () => {
      await putCatalogRows('customers', [catalogCustomer({ id: 'ajeno', organization_id: 999 })]);
      await expect(POSService.setCartCustomer('cart-1', 'ajeno')).rejects.toThrow(CUSTOMER_NOT_IN_CATALOG_MESSAGE);
    });

    it('quitar el cliente (sin id) funciona igual sin red', async () => {
      await POSService.setCartCustomer('cart-1', CUSTOMER_ID);
      const cart = await POSService.setCartCustomer('cart-1', undefined);
      expect(cart.customer_id).toBeUndefined();
      expect(cart.customer).toBeUndefined();
    });

    it('con red (o navegador): consulta Supabase como siempre', async () => {
      isAppOnlineMock.mockReturnValue(true);
      fake.setHandler((op: FakeOp) => (op.table === 'customers' ? { data: { id: CUSTOMER_ID, full_name: 'Desde Supabase' } } : { data: null }));
      const cart = await POSService.setCartCustomer('cart-1', CUSTOMER_ID);
      expect(cart.customer?.full_name).toBe('Desde Supabase');
      expect(fake.ops.map((o) => [o.table, o.action])).toEqual([['customers', 'select']]);
    });
  });

  describe('createCustomer', () => {
    it('Desktop sin red: id uuid generado, catálogo local con pending_sync, outbox pending y cero fetch', async () => {
      const created = await POSService.createCustomer({
        first_name: 'Pedro',
        last_name: 'Gómez Ruiz',
        doc_type: 'CC',
        doc_number: '2020',
        email: 'pedro@example.test',
        phone: '3222222222',
      });
      expect(created.id).toMatch(UUID_RE);
      expect(created.full_name).toBe('Pedro Gómez Ruiz');
      expect(created.doc_type).toBe('CC');
      expect(created.doc_number).toBe('2020');
      expect(created.pending_sync).toBe(true);
      expect(created.organization_id).toBe(ORG);
      expect(fake.ops).toHaveLength(0);

      expect((await getCatalogRow('customers', created.id))?.pending_sync).toBe(true);
      const record = await getOutboxCustomer(created.id);
      expect(record?.status).toBe('pending');
      expect(record?.organization_id).toBe(ORG);
      expect(record?.payload).toMatchObject({
        organization_id: ORG,
        branch_id: 7,
        first_name: 'Pedro',
        last_name: 'Gómez Ruiz',
        identification_type: 'CC',
        identification_number: '2020',
        email: 'pedro@example.test',
        customer_type: 'person',
      });
      // Nunca las columnas generadas.
      expect(record?.payload).not.toHaveProperty('full_name');
      expect(record?.payload).not.toHaveProperty('doc_type');
      expect(record?.payload).not.toHaveProperty('doc_number');

      // El selector lo encuentra al instante y se puede asignar al carrito.
      const found = await POSService.searchCustomers({ search: 'pedro', status: 'active' });
      expect(found.map((c) => c.id)).toEqual([created.id]);
      const cart = await POSService.setCartCustomer('cart-1', created.id);
      expect(cart.customer?.pending_sync).toBe(true);
    });

    it('Desktop sin red: parte full_name en nombres/apellidos si no vienen separados', async () => {
      const created = await POSService.createCustomer({ full_name: '  María  José   López ' });
      const record = await getOutboxCustomer(created.id);
      expect(record?.payload.first_name).toBe('María');
      expect(record?.payload.last_name).toBe('José López');
    });

    it('Desktop sin red: rechaza duplicados por documento o email del catálogo local', async () => {
      await expect(POSService.createCustomer({ full_name: 'Otra Laura', doc_type: 'CC', doc_number: '1010' })).rejects.toThrow(/documento.*Laura Mora/);
      await expect(POSService.createCustomer({ full_name: 'Otra Laura', email: 'LAURA@example.test' })).rejects.toThrow(/email.*Laura Mora/);
      expect(await listOutboxCustomers()).toHaveLength(0);
      expect(fake.ops).toHaveLength(0);
    });

    it('Desktop sin red: sin nombre no se crea', async () => {
      await expect(POSService.createCustomer({ doc_number: '3030' })).rejects.toThrow('nombre');
      expect(await listOutboxCustomers()).toHaveLength(0);
    });

    it('con red: inserta en Supabase como siempre (sin outbox)', async () => {
      isAppOnlineMock.mockReturnValue(true);
      fake.setHandler((op: FakeOp) => {
        if (op.table === 'customers' && op.action === 'insert') return { data: { id: 'srv-1', ...(op.payload as object) } };
        return { data: null };
      });
      const created = await POSService.createCustomer({ full_name: 'Ana Ríos', doc_type: 'CC', doc_number: '4040' });
      expect(created.id).toBe('srv-1');
      const insert = fake.ops.find((o) => o.action === 'insert');
      expect(insert?.payload).toMatchObject({ first_name: 'Ana', last_name: 'Ríos', identification_type: 'CC', identification_number: '4040' });
      expect(await listOutboxCustomers()).toHaveLength(0);
    });
  });
});
