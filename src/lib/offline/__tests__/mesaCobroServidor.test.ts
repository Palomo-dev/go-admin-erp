/**
 * Punto 1 (2026-09-24): la mesa cobra con el mismo cobro del POS.
 *
 * - El cobro de la mesa = UNA llamada a pos_checkout_v1 en modo 'settle' con
 *   la sesión de la mesa (antes: completarVentaMesa, N escrituras desde el
 *   navegador, cartera a mano y sin idempotencia).
 * - La cuenta dividida marca sus líneas pagadas en el servidor
 *   (paid_sale_item_ids) y manda la tasa del resto de líneas sin cobrarlas.
 * - Totales de la cuenta sin IVA doble: recalcularTotalVenta es la RPC
 *   pos_mesa_recalcular_venta y la pre-cuenta suma las líneas guardadas.
 * - Las líneas nuevas de la mesa siguen la regla única, restan el descuento y
 *   guardan su tasa y modo; las promociones reciben categoría y producto padre.
 *
 * El comportamiento en la base (total sin IVA doble, descuento que escala con
 * la cantidad, precio manipulado rechazado, cuenta dividida, reintento,
 * factura rehecha al agregar platos entre cobros) se probó en transacciones
 * deshechas. Datos inventados: organización 120, sucursal 9.
 */

import fs from 'fs';
import path from 'path';
import { createFakeSupabase, type FakeOp } from './fakeSupabase';

const fake = createFakeSupabase(() => ({ data: null }));
type ResultadoPromos = { discountTotal: number; itemDiscounts: Record<number, number>; applied: unknown[] };
const evaluarPromos = jest.fn<Promise<ResultadoPromos>, [unknown]>(async () => ({ discountTotal: 0, itemDiscounts: {}, applied: [] }));

jest.mock('@/lib/supabase/config', () => ({ supabase: fake.client }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 9,
  getCurrentBranchIdWithFallback: () => 9,
  getCurrentUserId: async () => 'user-cajero',
  getBranchFilter: () => null,
}));
jest.mock('@/lib/services/promotionEngine', () => ({
  promotionEngine: { evaluate: (ctx: unknown) => evaluarPromos(ctx) },
}));
jest.mock('@/lib/pos/display/posDisplay', () => ({ getPosDisplayEmitter: () => ({ onCartsSaved: jest.fn(), setMode: jest.fn() }) }));
jest.mock('@/lib/utils/offlineCache', () => ({ isAppOnline: jest.fn(() => true) }));
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: async () => 'America/Bogota' }));
jest.mock('@/components/pos/cocina/cocinaCliente', () => ({
  ajustarLineaMesa: jest.fn(async () => ({ accion: 'ajuste', sale_id: 'venta-mesa' })),
}));

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

import { installWindow, uninstallWindow } from './testEnv';
import { POSService } from '@/lib/services/posService';
import { PedidosService } from '@/components/pos/mesas/id/pedidosService';
import { __resetCheckoutRpcForTests, POS_CHECKOUT_RPC, type CheckoutEnvelope } from '../checkoutRpc';
import { totalesDeLineasGuardadas } from '@/lib/pos/lineaVenta';
import type { CheckoutData, Cart, CartItem } from '@/components/pos/types';
import type { TableSessionWithDetails } from '@/components/pos/mesas/id/types';

const SESION = '11111111-1111-4111-8111-111111111111';
const L1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const L2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const L3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const escrituras = (): FakeOp[] => fake.ops.filter((o) => o.action === 'insert' || o.action === 'update' || o.action === 'delete');
const rpcs = (fn: string) => fake.ops.filter((o) => o.table === `rpc:${fn}`);

function linea(id: string, extra: Partial<CartItem> = {}): CartItem {
  return {
    id, cart_id: 'venta-mesa', product_id: 1001, quantity: 1, unit_price: 23800, total: 23800,
    tax_rate: 19, tax_amount: 3800, discount_amount: 0,
    product: { id: 1001, name: 'Plato' } as CartItem['product'],
    created_at: '2026-09-24T12:00:00.000Z', updated_at: '2026-09-24T12:00:00.000Z',
    ...extra,
  };
}

function cobro(items: CartItem[], extra: Partial<CheckoutData> = {}): CheckoutData {
  const total = items.reduce((s, i) => s + i.total, 0);
  const cart: Cart = {
    id: 'venta-mesa', organization_id: 120, branch_id: 9, status: 'active', items,
    subtotal: total, tax_amount: 0, tax_total: 0, discount_amount: 0, discount_total: 0, total,
    created_at: '2026-09-24T12:00:00.000Z', updated_at: '2026-09-24T12:00:00.000Z',
  };
  return {
    cart, payments: [{ method: 'cash', amount: total }], total_paid: total, change: 0, tax_included: true,
    saleId: 'intento-1', createdAt: '2026-09-24T12:05:00.000Z', attemptId: 'intento-1',
    ...extra,
  } as CheckoutData;
}

function sobre(): CheckoutEnvelope {
  const op = rpcs(POS_CHECKOUT_RPC)[0];
  return (op.payload as { p_envelope: CheckoutEnvelope }).p_envelope;
}

beforeEach(() => {
  installWindow({ desktop: false });
  __resetCheckoutRpcForTests();
  fake.reset();
  evaluarPromos.mockClear();
  fake.setHandler((op) => (op.table === `rpc:${POS_CHECKOUT_RPC}`
    ? { data: { sale: { id: 'venta-mesa', total: 47600, status: 'paid' }, payments: [], replayed: false, completed: [], warnings: [] } }
    : { data: null }));
});
afterEach(() => uninstallWindow());

describe('cobro de la mesa: una llamada a pos_checkout_v1 en modo settle', () => {
  it('cuenta entera: venta de la sesión, llave del intento, líneas con su sale_item_id y ninguna escritura del navegador', async () => {
    const venta = await POSService.checkout({
      ...cobro([linea(L1), linea(L2)]),
      settle: { sale_id: 'venta-mesa', table_session_id: SESION },
    });
    expect(venta.id).toBe('venta-mesa');
    expect(rpcs(POS_CHECKOUT_RPC)).toHaveLength(1);
    const env = sobre();
    expect(env).toMatchObject({ mode: 'settle', sale_id: 'venta-mesa', payment_key: 'intento-1', table_session_id: SESION, branch_id: 9 });
    expect(env.items.map((i) => i.sale_item_id)).toEqual([L1, L2]);
    expect(env).not.toHaveProperty('paid_sale_item_ids');
    expect(env.promotion_ids).toEqual([]);
    expect(evaluarPromos).not.toHaveBeenCalled();
    // Ni sales, ni payments, ni invoice_sales, ni accounts_receivable, ni stock desde el navegador.
    expect(escrituras()).toHaveLength(0);
  });

  it('el reintento del mismo intento manda la misma llave (idempotencia de pagos en el servidor)', async () => {
    const datos = { ...cobro([linea(L1)]), settle: { sale_id: 'venta-mesa', table_session_id: SESION } };
    await POSService.checkout(datos);
    await POSService.checkout(datos);
    const llaves = rpcs(POS_CHECKOUT_RPC).map((o) => (o.payload as { p_envelope: CheckoutEnvelope }).p_envelope.payment_key);
    expect(llaves).toEqual(['intento-1', 'intento-1']);
  });

  it('cuenta dividida: marca en el servidor las líneas del split y manda la tasa del resto sin cobrarlo', async () => {
    await POSService.checkout({
      ...cobro([linea(L1)]),
      settle: {
        sale_id: 'venta-mesa', table_session_id: SESION, split_id: 'split-2',
        paid_sale_item_ids: [L1, 'no-es-uuid'],
        lineas_sin_cobrar: [
          linea(L2, { tax_rate: 8, tax_included: false }),
          linea(L1), // ya va en el cobro: no se repite
          linea(L3, { quantity: 0 }), // anulada: no viaja
          linea('split-virtual'), // sin id de línea real: no viaja
        ],
      },
    });
    const env = sobre();
    expect(env.split_id).toBe('split-2');
    expect(env.paid_sale_item_ids).toEqual([L1]);
    expect(env.items).toHaveLength(2);
    expect(env.items[1]).toMatchObject({ sale_item_id: L2, tax_rate: 8, tax_included: false, total: 0, serial_ids: [] });
    // Lo que se cobra es solo el split: el resto no suma a los totales del sobre.
    expect(env.totals.total).toBe(23800);
  });

  it('sin sesión de mesa (deuda de mostrador) no viajan claves de mesa', async () => {
    await POSService.checkout({ ...cobro([linea(L1)]), settle: { sale_id: 'venta-deuda' } });
    const env = sobre();
    expect(env).not.toHaveProperty('table_session_id');
    expect(env.items[0]).not.toHaveProperty('sale_item_id');
  });
});

describe('totales de la cuenta sin IVA doble', () => {
  const lineasIncluidas = [
    { quantity: 2, unit_price: 23800, total: 47600, tax_amount: 7600, discount_amount: 0 },
    { quantity: 0, unit_price: 10000, total: 0, tax_amount: 0, discount_amount: 0 },
  ];

  it('la suma de las líneas guardadas: total 47.600 (antes 55.200, el IVA contado dos veces)', () => {
    expect(totalesDeLineasGuardadas(lineasIncluidas)).toEqual({ subtotal: 40000, taxTotal: 7600, discountTotal: 0, total: 47600 });
    // La fórmula anterior de recalcularTotalVenta y generarPreCuenta:
    const anterior = 2 * 23800 + 7600 - 0;
    expect(anterior).toBe(55200);
  });

  it('generarPreCuenta usa esa suma', async () => {
    jest.spyOn(PedidosService, 'obtenerDetalleMesa').mockResolvedValueOnce({
      id: SESION, sale_items: lineasIncluidas,
    } as unknown as TableSessionWithDetails);
    const cuenta = await PedidosService.generarPreCuenta('mesa-1');
    expect(cuenta).toMatchObject({ subtotal: 40000, tax_total: 7600, total: 47600 });
  });

  it('recalcularTotalVenta es la RPC del servidor; el navegador no escribe la cabecera', async () => {
    await PedidosService.recalcularTotalVenta('venta-mesa');
    expect(rpcs('pos_mesa_recalcular_venta')).toHaveLength(1);
    expect(rpcs('pos_mesa_recalcular_venta')[0].payload).toEqual({ p_sale_id: 'venta-mesa' });
    expect(escrituras()).toHaveLength(0);
  });

  it('ajustar la cantidad no vuelve a escribir la cabecera desde el navegador (la RPC la recalcula)', async () => {
    await PedidosService.actualizarCantidadItem(L1, 3, 'cliente pidió más');
    await PedidosService.eliminarItem(L1, 'error del mesero');
    expect(escrituras()).toHaveLength(0);
    expect(rpcs('pos_mesa_recalcular_venta')).toHaveLength(0);
  });
});

describe('agregar productos a la mesa', () => {
  it('regla única de la línea (con el descuento), tasa y modo guardados, promociones con categoría y padre', async () => {
    jest.spyOn(POSService, 'getOrganizationTaxes').mockResolvedValue([
      { id: 1, name: 'IVA', rate: 19, is_default: true, is_active: true },
    ] as never);
    jest.spyOn(POSService, 'getProductTaxes').mockResolvedValue([
      { organization_taxes: { id: 1, name: 'IVA', rate: 19, is_active: true, tax_included: true } },
    ] as never);
    evaluarPromos.mockResolvedValueOnce({ discountTotal: 2380, itemDiscounts: { 2002: 2380 }, applied: [] });
    fake.setHandler((op) => {
      if (op.table === 'table_sessions' && op.action === 'select') {
        return { data: { sale_id: 'venta-mesa', restaurant_table_id: 'mesa-1', server_id: 'user-mesero' } };
      }
      if (op.table === 'sale_items' && op.action === 'insert') {
        return { data: (op.payload as unknown[]).map((p, i) => ({ ...(p as object), id: `si-${i}` })) };
      }
      return { data: null };
    });

    await PedidosService.agregarProductos(SESION, [{
      product_id: 2002, product_name: 'Variante', quantity: 2, unit_price: 11900, notes: '',
      category_id: 33, parent_product_id: 2000,
    }]);

    expect(evaluarPromos.mock.calls[0][0]).toMatchObject({
      items: [{ product_id: 2002, parent_product_id: 2000, category_id: 33, quantity: 2, unit_price: 11900 }],
    });
    const insert = fake.ops.find((o) => o.table === 'sale_items' && o.action === 'insert');
    // neto = 2 × 11.900 − 2.380 = 21.420; incluido: impuesto = 21.420 − 21.420/1,19 = 3.420.
    expect((insert?.payload as unknown[])[0]).toMatchObject({
      quantity: 2, unit_price: 11900, discount_amount: 2380, tax_rate: 19, tax_included: true,
      total: 21420, tax_amount: 3420,
    });
    // La cabecera la recalcula el servidor.
    expect(rpcs('pos_mesa_recalcular_venta')).toHaveLength(1);
    expect(fake.ops.some((o) => o.table === 'sales' && o.action === 'update')).toBe(false);
  });
});

describe('el código del cobro de la mesa', () => {
  const raiz = process.cwd();
  const pedidos = fs.readFileSync(path.join(raiz, 'src/components/pos/mesas/id/pedidosService.ts'), 'utf8');
  const pagina = fs.readFileSync(path.join(raiz, 'src/app/app/pos/mesas/[id]/page.tsx'), 'utf8');

  it('no queda una segunda implementación del cobro (regla 7)', () => {
    expect(pedidos).not.toContain('completarVentaMesa');
    expect(pedidos).not.toMatch(/from\('(payments|invoice_sales|invoice_items|accounts_receivable|commissions)'\)/);
    expect(pagina).not.toContain('PedidosService.completarVentaMesa');
    expect(pagina).toContain('POSService.checkout({ ...checkoutData, settle })');
  });

  it('la página ya no marca las líneas pagadas desde el navegador', () => {
    expect(pagina).not.toMatch(/paid_by_split_id:\s*currentSplit/);
  });
});

describe('migración 20260925140300', () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260925140300_pos_mesa_cobra_con_pos_checkout.sql'), 'utf8');

  it('regla única de la línea en SQL (la misma de calcularLineaVenta)', () => {
    expect(sql).toContain('create or replace function public.fn_pos_linea_totales(');
    expect(sql).toContain('x.n - x.n / (1 + coalesce(p_tax_rate, 0) / 100)');
  });

  it('el recálculo solo toca cuentas pendientes y la cabecera suma líneas + flete + propina', () => {
    expect(sql).toContain("v_sale.status not in ('pending', 'draft', 'partial')");
    expect(sql).toContain('v_total := v_lineas + coalesce(v_sale.delivery_fee, 0) + coalesce(v_sale.tip_amount, 0);');
  });

  it('pos_mesa_recalcular_venta: pertenencia y sucursal en el servidor, revocada a anon', () => {
    expect(sql).toContain('perform public.fn_assert_acceso_org(v_sale.organization_id);');
    expect(sql).toContain('public.app_branch_access(v_sale.branch_id)');
    expect(sql).toContain('revoke all on function public.pos_mesa_recalcular_venta(uuid) from public, anon;');
    expect(sql).toContain('revoke all on function public.fn_pos_recalcular_venta(uuid) from public, anon, authenticated;');
  });

  it('el ajuste de cantidad escala el descuento', () => {
    expect(sql).toContain('v_desc_linea := round(coalesce(v_si.discount_amount, 0) / coalesce(nullif(v_si.quantity, 0), 1) * p_nueva_cantidad, 2);');
  });

  it('el cobro valida la sesión y las líneas de la mesa, y nunca escribe la cartera', () => {
    expect(sql).toContain("raise exception 'sesion_mesa_invalida'");
    expect(sql).toContain('perform public.fn_pos_validar_linea_venta(v_org, v_actor');
    expect(sql).not.toMatch(/(insert into|update)\s+public\.accounts_receivable/i);
    expect(fs.existsSync(path.join(process.cwd(), 'supabase/rollbacks/20260925140300_pos_mesa_cobra_con_pos_checkout_rollback.sql'))).toBe(true);
  });

  it.each(['es', 'en', 'fr', 'pt'])('textos de los errores de la mesa en %s', (lang) => {
    const msgs = JSON.parse(fs.readFileSync(path.join(process.cwd(), `messages/${lang}.json`), 'utf8'));
    expect(typeof msgs.posCobroServidor.errores.sesion_mesa_invalida).toBe('string');
    expect(typeof msgs.posCobroServidor.errores.no_es_venta_de_mesa).toBe('string');
  });
});
