/**
 * Cuenta dividida de la mesa (E1 de docs/design/POS-MESAS-FLUJO-COMPLETO.md).
 *
 * El error: al cobrar una parte, el servidor marcaba pagada la línea ENTERA de
 * cada plato de la parte (aunque llevara 1 de 3 unidades) y el saldo de la mesa
 * se calculaba con las líneas sin pagar, no con los pagos. En «partes iguales»
 * y «montos» el navegador repartía los platos por turnos: tras el primer pago
 * el saldo quedaba en 0 y la mesa se liberaba sin haber cobrado todo.
 *
 * El arreglo vive en el servidor (migración 20260929060000): el saldo es total
 * − pagos, cada cobro abona a las líneas lo que de verdad entró
 * (sale_items.paid_amount) y un cobro de mesa no abona más que el saldo. Se
 * probó en transacciones deshechas (DO + RAISE) con 49 comprobaciones: partes
 * iguales de 2 y 3 comensales con redondeo, montos, por ítems, pago parcial +
 * segundo pago que completa, reintento idempotente, parte cobrada dos veces,
 * liberar con saldo y otra organización. Aquí: las reglas del navegador (las
 * partes por monto viajan sin platos) y el contenido de la migración.
 * Datos inventados: organización 120, sucursal 9.
 */

import fs from 'fs';
import path from 'path';
import { createFakeSupabase, type FakeOp } from '@/lib/offline/__tests__/fakeSupabase';

const fake = createFakeSupabase(() => ({ data: null }));

jest.mock('@/lib/supabase/config', () => ({ supabase: fake.client }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 9,
  getCurrentBranchIdWithFallback: () => 9,
  getCurrentUserId: async () => 'user-cajero',
  getBranchFilter: () => null,
}));
jest.mock('@/lib/services/promotionEngine', () => ({
  promotionEngine: { evaluate: async () => ({ discountTotal: 0, itemDiscounts: {}, applied: [] }) },
}));
jest.mock('@/lib/pos/display/posDisplay', () => ({ getPosDisplayEmitter: () => ({ onCartsSaved: jest.fn(), setMode: jest.fn() }) }));
jest.mock('@/lib/utils/offlineCache', () => ({ isAppOnline: jest.fn(() => true) }));
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: async () => 'America/Bogota' }));

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

import { installWindow, uninstallWindow } from '@/lib/offline/__tests__/testEnv';
import { POSService } from '@/lib/services/posService';
import { __resetCheckoutRpcForTests, POS_CHECKOUT_RPC, type CheckoutEnvelope } from '@/lib/offline/checkoutRpc';
import {
  abonadoPendiente,
  esDivisionPorMonto,
  redondearMoneda,
  repartirPartesIguales,
  saldoDeLineas,
} from '@/lib/pos/mesas/cuentaDividida';
import { CODIGOS_ERROR_COBRO } from '@/lib/pos/erroresCobro';
import type { CheckoutData, Cart, CartItem } from '@/components/pos/types';

const SESION = '11111111-1111-4111-8111-111111111111';
const L1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const L2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const rpcs = (fn: string): FakeOp[] => fake.ops.filter((o) => o.table === `rpc:${fn}`);
const sobre = (): CheckoutEnvelope =>
  (rpcs(POS_CHECKOUT_RPC)[0].payload as { p_envelope: CheckoutEnvelope }).p_envelope;
const leer = (ruta: string) => fs.readFileSync(path.join(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n');

describe('partes iguales: la suma es exactamente el total', () => {
  it('2 comensales', () => {
    expect(repartirPartesIguales(62000, 2, 0)).toEqual([31000, 31000]);
  });

  it('3 comensales en COP (sin decimales): la última parte absorbe el redondeo', () => {
    const partes = repartirPartesIguales(62000, 3, 0);
    expect(partes).toEqual([20667, 20667, 20666]);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(62000);
  });

  it('3 comensales en USD (2 decimales)', () => {
    const partes = repartirPartesIguales(100, 3, 2);
    expect(partes).toEqual([33.33, 33.33, 33.34]);
    expect(redondearMoneda(partes.reduce((a, b) => a + b, 0), 2)).toBe(100);
  });

  it('7 comensales: nunca queda un residuo sin cobrar', () => {
    const partes = repartirPartesIguales(100000, 7, 0);
    expect(partes).toHaveLength(7);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(100000);
  });

  it('valores degenerados: 0 comensales = 1 parte; total negativo = 0', () => {
    expect(repartirPartesIguales(5000, 0, 0)).toEqual([5000]);
    expect(repartirPartesIguales(-10, 2, 0)).toEqual([0, 0]);
  });
});

describe('saldo de las líneas tras un abono parcial', () => {
  const lineas = [
    { total: 60000, paid_amount: 31000, paid_at: null }, // 3 platos, abonado lo de parte y media
    { total: 2000, paid_amount: 0, paid_at: null },
    { total: 9000, paid_amount: 0, paid_at: '2026-09-28T20:00:00Z' }, // pagada: no cuenta
  ];

  it('lo abonado a líneas sin pagar', () => {
    expect(abonadoPendiente(lineas)).toBe(31000);
  });

  it('lo que falta: Σ (total − abonado) de las líneas sin pagar', () => {
    expect(saldoDeLineas(lineas)).toBe(31000);
  });

  it('un abono mayor que la línea no la vuelve negativa', () => {
    expect(saldoDeLineas([{ total: 1000, paid_amount: '5000' }])).toBe(0);
  });
});

describe('división por monto vs por platos', () => {
  it('partes sin platos = por monto (partes iguales o montos)', () => {
    expect(esDivisionPorMonto([{ items: [] }, { items: [] }])).toBe(true);
  });

  it('una parte con platos = por ítems', () => {
    expect(esDivisionPorMonto([{ items: [] }, { items: [{}] }])).toBe(false);
  });

  it('sin división', () => {
    expect(esDivisionPorMonto(null)).toBe(false);
    expect(esDivisionPorMonto([])).toBe(false);
  });
});

describe('el cobro de una parte por monto viaja SIN platos', () => {
  beforeEach(() => {
    installWindow({ desktop: false });
    __resetCheckoutRpcForTests();
    fake.reset();
    fake.setHandler((op) => (op.table === `rpc:${POS_CHECKOUT_RPC}`
      ? { data: { sale: { id: 'venta-mesa', total: 62000, status: 'pending' }, payments: [], replayed: false, completed: [], warnings: [] } }
      : { data: null }));
  });
  afterEach(() => uninstallWindow());

  function lineaMesa(id: string, extra: Partial<CartItem> = {}): CartItem {
    return {
      id, cart_id: 'venta-mesa', product_id: 1001, quantity: 3, unit_price: 20000, total: 60000,
      tax_rate: 0, tax_amount: 0, discount_amount: 0,
      product: { id: 1001, name: 'Plato' } as CartItem['product'],
      created_at: '2026-09-28T12:00:00.000Z', updated_at: '2026-09-28T12:00:00.000Z',
      ...extra,
    };
  }

  it('partes iguales: una línea virtual por el importe exacto, ningún plato marcado, el resto de líneas con su tasa', async () => {
    // La forma que arma convertSplitToCart para una parte sin platos.
    const virtual = {
      id: 'split-split-1', cart_id: 'venta-mesa', product_id: 0, quantity: 1, unit_price: 31000, total: 31000,
      tax_rate: 0, tax_amount: 0, tax_included: true, discount_amount: 0,
      product: { id: 0, name: 'Parte 1' } as CartItem['product'],
      created_at: '2026-09-28T12:00:00.000Z', updated_at: '2026-09-28T12:00:00.000Z',
    } as CartItem;
    const cart: Cart = {
      id: 'venta-mesa', organization_id: 120, branch_id: 9, status: 'active', items: [virtual], tax_included: true,
      subtotal: 31000, tax_amount: 0, tax_total: 0, discount_amount: 0, discount_total: 0, total: 31000,
      created_at: '2026-09-28T12:00:00.000Z', updated_at: '2026-09-28T12:00:00.000Z',
    };
    const datos = {
      cart, payments: [{ method: 'cash', amount: 31000 }], total_paid: 31000, change: 0, tax_included: true,
      saleId: 'intento-parte-1', createdAt: '2026-09-28T12:05:00.000Z', attemptId: 'intento-parte-1',
    } as CheckoutData;

    await POSService.checkout({
      ...datos,
      settle: {
        sale_id: 'venta-mesa', table_session_id: SESION, split_id: 'split-1',
        paid_sale_item_ids: [],
        lineas_sin_cobrar: [lineaMesa(L1), lineaMesa(L2, { quantity: 1, unit_price: 2000, total: 2000 })],
      },
    });

    const env = sobre();
    expect(env).toMatchObject({ mode: 'settle', payment_key: 'intento-parte-1', split_id: 'split-1' });
    // Ningún plato va como «pagado»: el servidor abona el pago a las líneas.
    expect(env).not.toHaveProperty('paid_sale_item_ids');
    expect(env.items[0]).not.toHaveProperty('sale_item_id');
    expect(env.items[0]).toMatchObject({ quantity: 1, unit_price: 31000, total: 31000, tax_rate: 0 });
    expect(env.items.slice(1).map((i) => [i.sale_item_id, i.total])).toEqual([[L1, 0], [L2, 0]]);
    // Se cobra la parte, ni un peso más.
    expect(env.totals.total).toBe(31000);
    expect(env.payments).toEqual([{ method: 'cash', amount: 31000 }]);
  });

  it('por ítems: las líneas de la parte viajan con su CANTIDAD (el servidor abona solo esa porción)', async () => {
    const parte = lineaMesa(L1, { quantity: 1, total: 20000 });
    const cart: Cart = {
      id: 'venta-mesa', organization_id: 120, branch_id: 9, status: 'active', items: [parte],
      subtotal: 20000, tax_amount: 0, tax_total: 0, discount_amount: 0, discount_total: 0, total: 20000,
      created_at: '2026-09-28T12:00:00.000Z', updated_at: '2026-09-28T12:00:00.000Z',
    };
    await POSService.checkout({
      cart, payments: [{ method: 'cash', amount: 20000 }], total_paid: 20000, change: 0,
      saleId: 'intento-items', createdAt: '2026-09-28T12:05:00.000Z', attemptId: 'intento-items',
      settle: { sale_id: 'venta-mesa', table_session_id: SESION, split_id: 'split-1', paid_sale_item_ids: [L1] },
    } as CheckoutData);
    const env = sobre();
    expect(env.paid_sale_item_ids).toEqual([L1]);
    expect(env.items[0]).toMatchObject({ sale_item_id: L1, quantity: 1 });
  });
});

describe('la pantalla ya no reparte platos por turnos', () => {
  const dialogo = leer('src/components/pos/mesas/id/SplitBillDialog.tsx');
  const pagina = leer('src/app/app/pos/mesas/[id]/page.tsx');

  it('SplitBillDialog: partes iguales y montos sin platos, reparto exacto', () => {
    expect(dialogo).not.toContain('autoAssignItemsRoundRobin');
    expect(dialogo).toContain('repartirPartesIguales(total');
    // Solo se reparte lo que sigue sin pagar (E6).
    expect(dialogo).toMatch(/filter\(\(l\) => !l\.paid_at\)/);
  });

  it('la página: sin «productos sin asignar» en partes por monto y cobro del saldo tras un abono', () => {
    expect(pagina).toContain('esDivisionPorMonto(billSplits) ? []');
    expect(pagina).toContain('abonadoPendiente(session.sale_items || []) > 0');
    expect(pagina).toContain('saldoDeLineas(session.sale_items || [])');
  });
});

describe('migración 20260929060000', () => {
  const sql = leer('supabase/migrations/20260929060000_pos_mesa_cuenta_dividida_abono_real.sql');
  const rollback = 'supabase/rollbacks/20260929060000_pos_mesa_cuenta_dividida_abono_real_rollback.sql';

  it('abono acumulado por línea, aditivo', () => {
    expect(sql).toContain('add column if not exists paid_amount numeric not null default 0');
    expect(sql).not.toMatch(/drop\s+(table|column)/i);
  });

  it('fn_pos_mesa_saldo: total − pagos siempre (ya no «líneas sin paid_at») y tolerancia de la moneda', () => {
    const cuerpo = sql.slice(sql.indexOf('create or replace function public.fn_pos_mesa_saldo'), sql.indexOf('-- ── 4.'));
    expect(cuerpo).toContain('v_saldo := greatest(0, round(v_total - v_pagado, 2));');
    expect(cuerpo).not.toContain('v_saldo := v_sin_pagar');
    expect(cuerpo).toContain('public.fn_pos_tolerancia_moneda(v_sale.organization_id)');
    expect(cuerpo).toContain('revoke all on function public.fn_pos_mesa_saldo(uuid) from public, anon, authenticated;');
  });

  it('pos_checkout_v1: parche sobre la definición viva, fragmentos exactamente una vez', () => {
    expect(sql).toContain('pg_get_functiondef(p_fn)');
    expect(sql).toContain('no aparece exactamente una vez');
    expect(sql).toContain("raise exception ''pago_excede_saldo''");
    expect(sql).toContain('paid_amount      = paid_amount + v_porcion');
    // La línea queda pagada solo cuando su abono cubre su total.
    expect(sql).toContain('case when paid_amount + v_porcion >= total - v_tol then now() end');
    // Ya no se marca la línea entera con paid_sale_item_ids.
    const reemplazos = sql.slice(sql.indexOf('  array[\n    -- 1.\n'));
    expect(reemplazos).not.toContain('paid_at = now(), paid_by_split_id = nullif');
    // Sigue el enganche de membresías.
    expect(sql).toContain("'Membresías (20260929001100)'");
  });

  it('tolerancia: la unidad mínima de la moneda base, sin elevación y revocada a anon', () => {
    expect(sql).toContain('power(10::numeric, -c.decimals)');
    expect(sql).toContain('public.fn_moneda_base_organizacion(p_org)');
    expect(sql).toContain('revoke all on function public.fn_pos_tolerancia_moneda(integer) from public, anon;');
  });

  it('tiene su rollback', () => {
    expect(fs.existsSync(path.join(process.cwd(), rollback))).toBe(true);
    const r = leer(rollback);
    expect(r).toContain('cuenta_dividida_desparchar');
    expect(r).toContain('v_saldo := v_sin_pagar;');
    expect(r).toContain('drop function if exists public.fn_pos_tolerancia_moneda(integer);');
  });

  it('el error del tope tiene código estable y texto en los 4 idiomas', () => {
    expect(CODIGOS_ERROR_COBRO).toContain('pago_excede_saldo');
    for (const lang of ['es', 'en', 'fr', 'pt']) {
      const msgs = JSON.parse(leer(`messages/${lang}.json`));
      expect(typeof msgs.posCobroServidor.errores.pago_excede_saldo).toBe('string');
    }
  });
});
