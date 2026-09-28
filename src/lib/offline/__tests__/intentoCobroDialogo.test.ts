/**
 * Punto 2 (2026-09-24): venta duplicada en el navegador (E-35 / BE3).
 *
 * Antes, en el navegador, `POSService.checkout` generaba el `sale_id` en cada
 * llamada: si el primer «Completar venta» llegaba a la base pero la respuesta
 * se perdía (timeout), el reintento creaba OTRA venta con otro id. Ahora el
 * diálogo genera el id una vez por intento de cobro (al primer clic) y lo
 * reutiliza en los reintentos; `pos_checkout_v1` es idempotente por ese id.
 *
 * Datos inventados: organización 120, sucursal 7.
 */

import fs from 'fs';
import path from 'path';
import { createFakeSupabase } from './fakeSupabase';

const fake = createFakeSupabase(() => ({ data: null }));

jest.mock('@/lib/supabase/config', () => ({ supabase: fake.client }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
  getCurrentBranchIdWithFallback: () => 7,
  getCurrentUserId: async () => 'user-cajero',
}));
jest.mock('@/lib/services/promotionEngine', () => ({
  promotionEngine: { evaluate: jest.fn(async () => ({ discountTotal: 0, itemDiscounts: {}, applied: [] })) },
}));
jest.mock('@/lib/pos/display/posDisplay', () => ({ getPosDisplayEmitter: () => ({ onCartsSaved: jest.fn(), setMode: jest.fn() }) }));
jest.mock('@/lib/utils/offlineCache', () => ({ isAppOnline: jest.fn(() => true) }));

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

import { installWindow, uninstallWindow } from './testEnv';
import { POSService } from '@/lib/services/posService';
import type { CheckoutData } from '@/components/pos/types';
import { __resetCheckoutRpcForTests, POS_CHECKOUT_RPC, type CheckoutEnvelope } from '../checkoutRpc';

const INTENTO = '44444444-4444-4444-8444-444444444444';
const CREADO = '2026-09-24T15:00:00.000Z';

function checkout(extra: Partial<CheckoutData> = {}): CheckoutData {
  return {
    cart: {
      id: 'cart-1', organization_id: 120, branch_id: 7, status: 'active',
      items: [{ id: 'l1', product_id: 1001, quantity: 1, unit_price: 10000, total: 10000, tax_rate: 0, discount_amount: 0, product: { id: 1001, name: 'A' } } as never],
      subtotal: 10000, tax_amount: 0, tax_total: 0, discount_amount: 0, discount_total: 0, total: 10000,
      created_at: CREADO, updated_at: CREADO,
    },
    payments: [{ method: 'cash', amount: 10000 }],
    change: 0,
    total_paid: 10000,
    ...extra,
  };
}

describe('el id de la venta es del intento de cobro, no de cada clic', () => {
  let llamadas = 0;
  beforeEach(() => {
    installWindow({ desktop: false });
    __resetCheckoutRpcForTests();
    fake.reset();
    llamadas = 0;
    localStorage.setItem('pos_carts_120', JSON.stringify([{ id: 'cart-1', status: 'active', items: [] }]));
    fake.setHandler((op) => {
      if (op.table === `rpc:${POS_CHECKOUT_RPC}`) {
        llamadas += 1;
        const env = (op.payload as { p_envelope: CheckoutEnvelope }).p_envelope;
        // Primer envío: llegó a la base pero la respuesta se perdió.
        if (llamadas === 1) throw new Error('timeout');
        return { data: { sale: { id: env.sale_id, total: env.totals.total }, invoice: null, payments: [], replayed: true, completed: [], warnings: [] } };
      }
      if (op.table === 'rpc:get_organization_currencies') return { data: [{ code: 'COP', is_base: true }] };
      return { data: null };
    });
  });
  afterEach(() => uninstallWindow());

  it('el reintento con el mismo intento manda el mismo sale_id y la RPC devuelve la venta existente', async () => {
    const datos = checkout({ saleId: INTENTO, createdAt: CREADO, attemptId: INTENTO });
    await expect(POSService.checkout(datos)).rejects.toThrow();
    const venta = await POSService.checkout(datos);
    const sobres = fake.ops
      .filter((o) => o.table === `rpc:${POS_CHECKOUT_RPC}`)
      .map((o) => (o.payload as { p_envelope: CheckoutEnvelope }).p_envelope);
    expect(sobres).toHaveLength(2);
    expect(sobres[0].sale_id).toBe(INTENTO);
    expect(sobres[1].sale_id).toBe(INTENTO);
    expect(sobres[1].created_at).toBe(CREADO);
    expect(venta.id).toBe(INTENTO);
    expect(venta.replayed).toBe(true);
  });
});

describe('guardia: el diálogo genera el id una vez por intento', () => {
  const fuente = fs.readFileSync(path.join(process.cwd(), 'src/components/pos/CheckoutDialog.tsx'), 'utf8');

  it('usa el id del intento para saleId, createdAt y attemptId (navegador y escritorio)', () => {
    expect(fuente).toMatch(/saleId:\s*intento\.id/);
    expect(fuente).toMatch(/createdAt:\s*intento\.creadoEn/);
    expect(fuente).toMatch(/attemptId:\s*intento\.id/);
    // Ya no se genera un id nuevo por clic dentro del objeto del cobro.
    expect(fuente).not.toMatch(/saleId:\s*newSaleId\(\)/);
  });

  it('el intento se crea solo si no existe y se reinicia al abrir el cobro', () => {
    expect(fuente).toMatch(/if \(!intentoCobroRef\.current\) \{\s*intentoCobroRef\.current = \{ id: newSaleId\(\)/);
    expect(fuente).toMatch(/intentoCobroRef\.current = null;/);
  });
});
