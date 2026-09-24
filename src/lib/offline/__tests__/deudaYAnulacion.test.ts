/**
 * Punto 6 (2026-09-24): deuda, cobro de deuda y anulaciones en el servidor.
 *
 * - «Deuda» = UNA llamada a pos_checkout_v1 en modo 'debt' con la sucursal
 *   del carrito; el id de la venta se guarda en el carrito antes de llamar y
 *   el reintento lo reutiliza (antes: N inserts sin idempotencia).
 * - «Anular deuda» y «Anular venta» = UNA llamada a pos_anular_venta_v1; el
 *   cliente ya no escribe invoice_sales, sales ni accounts_receivable.
 * - La migración: permiso pos.void en el servidor, cartera por disparadores,
 *   stock por kardex, caja abierta para anular pagos.
 *
 * El comportamiento en la base (deuda sin cliente, abono, reintento, saldo con
 * flete y propina, venta pagada, anulación sin permiso / sin motivo / con caja
 * cerrada, stock que vuelve, idempotencia) se probó en transacciones deshechas.
 *
 * Datos inventados: organización 120, sucursales 7 y 9.
 */

import fs from 'fs';
import path from 'path';
import { createFakeSupabase, type FakeOp } from './fakeSupabase';

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
  promotionEngine: { evaluate: jest.fn(async () => ({ discountTotal: 0, itemDiscounts: {}, applied: [] })) },
}));
jest.mock('@/lib/pos/display/posDisplay', () => ({ getPosDisplayEmitter: () => ({ onCartsSaved: jest.fn(), setMode: jest.fn() }) }));
jest.mock('@/lib/utils/offlineCache', () => ({ isAppOnline: jest.fn(() => true) }));
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: async () => 'America/Bogota' }));

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

import { installWindow, uninstallWindow } from './testEnv';
import { POSService } from '@/lib/services/posService';
import { VentasService } from '@/components/pos/ventas/VentasService';
import { __resetCheckoutRpcForTests, POS_CHECKOUT_RPC, type CheckoutEnvelope } from '../checkoutRpc';
import { AVISOS_ANULACION } from '@/lib/pos/erroresCobro';

const KEY = 'pos_carts_120';
const leer = () => JSON.parse(localStorage.getItem(KEY) || '[]') as Array<Record<string, unknown>>;
const escrituras = (): FakeOp[] => fake.ops.filter((o) => o.action === 'insert' || o.action === 'update' || o.action === 'delete');
const rpcs = (fn: string) => fake.ops.filter((o) => o.table === `rpc:${fn}`);

function carritoConDeuda(extra: Record<string, unknown> = {}) {
  return {
    id: 'cart-7', organization_id: 120, branch_id: 7, status: 'active', customer_id: 'cli-1',
    items: [{ id: 'l1', cart_id: 'cart-7', product_id: 1001, quantity: 2, unit_price: 10000, total: 20000, discount_amount: 0, tax_rate: 19, tax_amount: 3800, tax_included: false, product: { id: 1001, name: 'A' }, created_at: '2026-09-24T12:00:00.000Z' }],
    subtotal: 20000, tax_total: 3800, discount_total: 0, total: 23800, tax_included: false,
    created_at: '2026-09-24T12:00:00.000Z', updated_at: '2026-09-24T12:00:00.000Z',
    ...extra,
  };
}

beforeEach(() => {
  installWindow({ desktop: false });
  __resetCheckoutRpcForTests();
  fake.reset();
});
afterEach(() => uninstallWindow());

describe('«Deuda»: una llamada a pos_checkout_v1 en modo debt', () => {
  it('manda la sucursal del carrito, la línea con la regla única y el plazo; guarda el carrito en deuda', async () => {
    localStorage.setItem(KEY, JSON.stringify([carritoConDeuda()]));
    let idGuardadoAntes: unknown = null;
    fake.setHandler((op) => {
      if (op.table === `rpc:${POS_CHECKOUT_RPC}`) {
        idGuardadoAntes = leer()[0].debt_attempt_id;
        const env = (op.payload as { p_envelope: CheckoutEnvelope }).p_envelope;
        return { data: {
          sale: { id: env.sale_id }, payments: [], replayed: false, completed: [], warnings: [],
          invoice: { id: 'inv-1', number: 'FACT-0042', total: '23800.00', balance: '23800.00', due_date: '2026-10-09T12:00:00Z', status: 'issued' },
        } };
      }
      if (op.table === 'rpc:get_organization_currencies') return { data: [{ code: 'COP', is_base: true }] };
      if (op.table === 'accounts_receivable') return { data: { id: 'ar-1', amount: 23800, balance: 23800, due_date: '2026-10-09T12:00:00Z', status: 'current' } };
      return { data: null };
    });

    const r = await POSService.holdCartWithDebt({ cartId: 'cart-7', reason: 'cliente frecuente', paymentTerms: 15 });

    expect(rpcs(POS_CHECKOUT_RPC)).toHaveLength(1);
    const env = (rpcs(POS_CHECKOUT_RPC)[0].payload as { p_envelope: CheckoutEnvelope }).p_envelope;
    expect(env).toMatchObject({ mode: 'debt', branch_id: 7, customer_id: 'cli-1', payments: [], debt: { reason: 'cliente frecuente', payment_terms: 15 } });
    expect(env.totals).toMatchObject({ total: 23800, total_paid: 0, tax_total: 3800 });
    expect(env.items[0]).toMatchObject({ unit_price: 10000, tax_rate: 19, tax_amount: 3800, total: 23800, tax_included: false });
    // El id se guardó ANTES de llamar y es el de la venta.
    expect(idGuardadoAntes).toBe(env.sale_id);
    // Ninguna escritura directa desde el navegador.
    expect(escrituras()).toHaveLength(0);
    expect(r.invoice).toMatchObject({ id: 'inv-1', number: 'FACT-0042', total: 23800 });
    expect(r.accountReceivable).toMatchObject({ id: 'ar-1', balance: 23800 });
    expect(leer()[0]).toMatchObject({ status: 'hold_with_debt', sale_id: env.sale_id, invoice_id: 'inv-1', debt_attempt_id: null });
    expect(String(leer()[0].notes)).toMatch(/^Factura: FACT-0042 \| Vence: 09\/10\/2026$/);
  });

  it('un reintento tras un corte reutiliza el mismo id de venta (no crea otra deuda)', async () => {
    localStorage.setItem(KEY, JSON.stringify([carritoConDeuda()]));
    const vistos: string[] = [];
    fake.setHandler((op) => {
      if (op.table === `rpc:${POS_CHECKOUT_RPC}`) {
        const env = (op.payload as { p_envelope: CheckoutEnvelope }).p_envelope;
        vistos.push(env.sale_id);
        if (vistos.length === 1) throw new Error('timeout');
        return { data: { sale: { id: env.sale_id }, invoice: { id: 'inv-1', number: 'FACT-1', total: 23800, due_date: null, status: 'issued' }, payments: [], replayed: true, completed: [], warnings: [] } };
      }
      if (op.table === 'rpc:get_organization_currencies') return { data: [{ code: 'COP', is_base: true }] };
      return { data: null };
    });
    await expect(POSService.holdCartWithDebt({ cartId: 'cart-7', reason: 'x' })).rejects.toThrow('timeout');
    await POSService.holdCartWithDebt({ cartId: 'cart-7', reason: 'x' });
    expect(vistos).toHaveLength(2);
    expect(vistos[0]).toBe(vistos[1]);
  });

  it('sin cliente no llama al servidor (regla existente)', async () => {
    localStorage.setItem(KEY, JSON.stringify([carritoConDeuda({ customer_id: undefined })]));
    await expect(POSService.holdCartWithDebt({ cartId: 'cart-7', reason: 'x' })).rejects.toThrow(/cliente/);
    expect(rpcs(POS_CHECKOUT_RPC)).toHaveLength(0);
  });
});

describe('anular: una llamada a pos_anular_venta_v1', () => {
  it('«Anular deuda» no escribe factura, venta ni cartera desde el navegador', async () => {
    localStorage.setItem(KEY, JSON.stringify([carritoConDeuda({ status: 'hold_with_debt', sale_id: 'venta-1', invoice_id: 'inv-1' })]));
    fake.setHandler((op) => {
      if (op.table === 'rpc:pos_anular_venta_v1') {
        return { data: { sale_id: 'venta-1', ya_anulada: false, nota_credito_id: 'nc-1', nota_credito_numero: 'NC-0007', pagos_anulados: 0, avisos: [] } };
      }
      return { data: null };
    });
    const r = await POSService.cancelDebtWithCreditNote('cart-7');
    expect(rpcs('pos_anular_venta_v1')).toHaveLength(1);
    expect(rpcs('pos_anular_venta_v1')[0].payload).toEqual({ p_sale_id: 'venta-1', p_motivo: 'Deuda anulada desde el POS' });
    expect(escrituras()).toHaveLength(0);
    expect(r.creditNote).toEqual({ id: 'nc-1', number: 'NC-0007' });
    expect(leer()[0].status).toBe('cancelled');
  });

  it('el error del servidor (sin permiso) llega con su código y el carrito no cambia', async () => {
    localStorage.setItem(KEY, JSON.stringify([carritoConDeuda({ status: 'hold_with_debt', sale_id: 'venta-1', invoice_id: 'inv-1' })]));
    fake.setHandler((op) => (op.table === 'rpc:pos_anular_venta_v1' ? { error: { message: 'sin_permiso', code: '42501' } } : { data: null }));
    await expect(POSService.cancelDebtWithCreditNote('cart-7')).rejects.toMatchObject({ message: 'sin_permiso' });
    expect(leer()[0].status).toBe('hold_with_debt');
  });

  it('VentasService: anular una venta es la misma RPC (antes solo marcaba void)', async () => {
    fake.setHandler((op) => (op.table === 'rpc:pos_anular_venta_v1'
      ? { data: { sale_id: 'venta-9', ya_anulada: false, pagos_anulados: 1, productos_devueltos: 2, avisos: ['factura_electronica_sin_nota_credito_dian'] } }
      : { data: null }));
    const r = await VentasService.anularVenta('venta-9', 'cliente se arrepintió');
    expect(r).toMatchObject({ pagos_anulados: 1, productos_devueltos: 2, avisos: ['factura_electronica_sin_nota_credito_dian'] });
    expect(await VentasService.cancelSale('venta-9', 'cliente se arrepintió')).toBe(true);
    expect(escrituras()).toHaveLength(0);
  });
});

describe('migración: anulación y deuda en el servidor', () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260925140200_pos_deuda_cobro_y_anulacion.sql'), 'utf8');
  const anular = sql.slice(sql.indexOf('create or replace function public.pos_anular_venta_v1'));

  it('el permiso se resuelve en el servidor con fn_tiene_permiso (pos.void), nunca por rol', () => {
    expect(anular).toContain("public.fn_tiene_permiso(v_sale.organization_id, 'pos.void')");
    expect(anular).not.toMatch(/role_name|roles\.name|'admin'/i);
  });

  it('la cartera la mantienen los disparadores: nunca se escribe accounts_receivable', () => {
    expect(sql).not.toMatch(/(insert into|update)\s+public\.accounts_receivable/i);
  });

  it('revierte stock por kardex, propinas con su anulación existente y exige caja abierta para los pagos', () => {
    expect(anular).toContain('public.fn_stock_entrada_devolucion(');
    expect(anular).toContain('public.fn_propina_anular(');
    expect(anular).toContain("raise exception 'caja_cerrada'");
    expect(anular).toContain('public.fn_revertir_asiento_en_fecha(');
    expect(anular).toContain("'factura_electronica_sin_nota_credito_dian'");
  });

  it('funciones revocadas a anon; pos_cobros sin escritura para authenticated', () => {
    expect(sql).toContain('revoke all on function public.pos_anular_venta_v1(uuid, text) from public, anon;');
    expect(sql).toContain('revoke insert, update, delete on public.pos_cobros from authenticated;');
    expect(sql).toContain('alter table public.pos_cobros enable row level security;');
  });

  it('cada pago se anula con fn_anular_pago, la anulación única de pagos (regla 7)', () => {
    const c2 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260925140250_pos_anular_venta_usa_fn_anular_pago.sql'), 'utf8');
    const nuevo = c2.slice(c2.indexOf('v_new0 text := $frag0$'));
    expect(nuevo).toContain('select public.fn_anular_pago(v_pago.id, v_motivo) as r into v_je;');
    expect(nuevo).not.toContain("set status = 'cancelled'");
    expect(fs.existsSync(path.join(process.cwd(), 'supabase/rollbacks/20260925140250_pos_anular_venta_usa_fn_anular_pago_rollback.sql'))).toBe(true);
  });

  it.each(['es', 'en', 'fr', 'pt'])('textos de la anulación en %s', (lang) => {
    const msgs = JSON.parse(fs.readFileSync(path.join(process.cwd(), `messages/${lang}.json`), 'utf8'));
    expect(typeof msgs.posCobroServidor.ventaAnulada).toBe('string');
    expect(typeof msgs.posCobroServidor.anulacionFallida).toBe('string');
    for (const aviso of AVISOS_ANULACION) expect(typeof msgs.posCobroServidor.avisos[aviso]).toBe('string');
  });

  it('pos_checkout_v1: deuda exige cliente y nace sin pagos; settle idempotente por payment_key', () => {
    expect(sql).toContain("raise exception 'deuda_sin_cliente'");
    expect(sql).toContain("raise exception 'deuda_con_pagos'");
    expect(sql).toContain('select * into v_cobro from public.pos_cobros c where c.id = v_key;');
    expect(sql).toContain("raise exception 'venta_ya_pagada'");
  });
});
