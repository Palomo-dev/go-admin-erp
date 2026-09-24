/**
 * Fija lo que `POSService.checkout` manda a `pos_checkout_v1` por línea según
 * los controles de impuesto (2026-09-23, docs/design/POS-CARRITO-LINEAS-NOTAS.md §7).
 *
 * El cobro recibe el carrito que arma `CheckoutDialog` (con `tax_rate` ya
 * repartido) y por cada línea calcula:
 *   incluido = item.tax_included ?? checkout.tax_included
 *   impuesto = incluido ? neto − neto/(1+tasa) : neto·tasa
 * `tax_excluded` no se lee aquí: una línea excluida con tasa > 0 paga impuesto.
 * Esa es la conducta actual y este test la congela (no la da por buena).
 *
 * Datos inventados: organización 120, sucursal 7.
 */

import { createFakeSupabase, type FakeHandler } from './fakeSupabase';

const fake = createFakeSupabase(() => ({ data: null }));

jest.mock('@/lib/supabase/config', () => ({ supabase: fake.client }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
  getCurrentBranchIdWithFallback: () => 7,
  getCurrentUserId: async () => 'user-sync',
}));
jest.mock('@/lib/utils/invoiceUtils', () => ({ generateInvoiceNumber: jest.fn(async () => 'FACT-000001') }));
jest.mock('@/lib/services/creditNoteNumberService', () => ({ CreditNoteNumberService: {} }));
jest.mock('@/lib/services/stockMovementService', () => ({
  stockMovementService: { decrementOnSale: jest.fn(async () => ({ errors: [], skipped: 0 })) },
}));
jest.mock('@/lib/services/serialTrackingService', () => ({ serialTrackingService: { sellSerials: jest.fn() } }));
jest.mock('@/lib/services/promotionEngine', () => ({
  promotionEngine: { evaluate: jest.fn(async () => ({ discountTotal: 0, itemDiscounts: {}, applied: [] })) },
}));
jest.mock('@/lib/pos/display/posDisplay', () => ({ getPosDisplayEmitter: () => ({ onCartsSaved: jest.fn(), setMode: jest.fn() }) }));
jest.mock('@/lib/utils/offlineCache', () => ({ isAppOnline: jest.fn(() => true) }));

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});

import { installWindow, uninstallWindow, freshIndexedDb } from './testEnv';
import { POSService } from '@/lib/services/posService';
import type { CartItem, CheckoutData } from '@/components/pos/types';
import { __resetCheckoutRpcForTests, POS_CHECKOUT_RPC, type CheckoutEnvelope } from '../checkoutRpc';

const RPC_TABLE = `rpc:${POS_CHECKOUT_RPC}`;

function linea(extra: Partial<CartItem>): CartItem {
  return {
    id: 'l1',
    cart_id: 'cart-1',
    product_id: 1001,
    product: { id: 1001, name: 'Hamburguesa' } as never,
    quantity: 2,
    unit_price: 10000,
    total: 20000,
    discount_amount: 0,
    tax_rate: 19,
    created_at: '2026-09-23T12:00:00.000Z',
    updated_at: '2026-09-23T12:00:00.000Z',
    ...extra,
  };
}

function checkout(items: CartItem[], taxIncluded: boolean): CheckoutData {
  return {
    cart: {
      id: 'cart-1',
      organization_id: 120,
      branch_id: 7,
      status: 'active',
      items,
      subtotal: 0,
      tax_amount: 0,
      tax_total: 0,
      discount_amount: 0,
      discount_total: 0,
      total: 0,
      created_at: '2026-09-23T12:00:00.000Z',
      updated_at: '2026-09-23T12:00:00.000Z',
      tax_included: taxIncluded,
    },
    payments: [{ method: 'cash', amount: 50000 }],
    change: 0,
    total_paid: 50000,
    tax_included: taxIncluded,
  };
}

let sobre: CheckoutEnvelope | null = null;

const handler: FakeHandler = (op) => {
  if (op.table === RPC_TABLE) {
    sobre = (op.payload as { p_envelope: CheckoutEnvelope }).p_envelope;
    return {
      data: {
        sale: { id: sobre.sale_id, organization_id: 120, branch_id: 7, total: sobre.totals.total, status: 'paid' },
        invoice: null,
        payments: [],
        replayed: false,
        completed: [],
        warnings: [],
      },
    };
  }
  if (op.table === 'rpc:get_organization_currencies') return { data: [{ code: 'COP', is_base: true }] };
  return { data: null };
};

async function cobrar(items: CartItem[], taxIncluded: boolean): Promise<CheckoutEnvelope> {
  sobre = null;
  localStorage.setItem('pos_carts_120', JSON.stringify([{ id: 'cart-1', status: 'active', items: [] }]));
  await POSService.checkout(checkout(items, taxIncluded));
  if (!sobre) throw new Error('no se llamó a la RPC');
  return sobre;
}

describe('POSService.checkout → pos_checkout_v1: impuesto por línea', () => {
  beforeEach(() => {
    freshIndexedDb();
    __resetCheckoutRpcForTests();
    fake.reset();
    fake.setHandler(handler);
    installWindow({ desktop: false });
  });
  afterEach(() => uninstallWindow());

  it('sin controles: IVA encima', async () => {
    const s = await cobrar([linea({})], false);
    expect(s.items[0]).toMatchObject({ tax_rate: 19, tax_amount: 3800, total: 23800, tax_included: false });
    expect(s.totals).toMatchObject({ subtotal: 20000, tax_total: 3800, total: 23800 });
    expect(s.tax_included).toBe(false);
  });

  it('«Incluido» en la línea: IVA de dentro aunque el cobro diga «no incluido»', async () => {
    const s = await cobrar([linea({ tax_included: true })], false);
    expect(s.items[0]).toMatchObject({ tax_amount: 3193.28, total: 20000, tax_included: true });
    expect(s.totals).toMatchObject({ subtotal: 16806.72, tax_total: 3193.28, total: 20000 });
  });

  it('cobro «incluido» y línea sin valor propio: incluido', async () => {
    const s = await cobrar([linea({ tax_included: undefined })], true);
    expect(s.items[0]).toMatchObject({ tax_amount: 3193.28, total: 20000, tax_included: true });
    expect(s.tax_included).toBe(true);
  });

  it('«Excluir impuesto» con tasa > 0: el cobro NO la mira, cobra el IVA (conducta actual)', async () => {
    const s = await cobrar([linea({ tax_excluded: true, tax_included: false })], false);
    expect(s.items[0]).toMatchObject({ tax_rate: 19, tax_amount: 3800, total: 23800, tax_included: false });
  });

  it('descuento: el IVA va sobre la base descontada', async () => {
    const s = await cobrar([linea({ discount_amount: 1000 })], false);
    expect(s.items[0]).toMatchObject({ discount_amount: 1000, tax_amount: 3610, total: 22610 });
    expect(s.totals).toMatchObject({ subtotal: 19000, tax_total: 3610, discount_total: 1000, total: 22610 });
  });

  it('la nota de la línea viaja como notes.extra', async () => {
    const s = await cobrar([linea({ notes: 'sin cebolla' })], false);
    expect(s.items[0].notes).toMatchObject({ product_name: 'Hamburguesa', extra: 'sin cebolla' });
  });
});
