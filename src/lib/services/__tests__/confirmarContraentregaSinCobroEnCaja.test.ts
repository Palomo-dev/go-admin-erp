/// <reference types="jest" />
/**
 * Error en producción (2026-11-24): al oprimir «Confirmar pedido» con «Marcar como pagado» en un
 * pedido contraentrega con anticipo pagado, la confirmación intentaba `fn_cobrar_pedido_web_en_caja`
 * y salía «Pedido confirmado sin cobrar · La sede no tiene caja abierta». El resto de ese pedido se
 * cobra al ENTREGAR (domiciliario / Cuadres, o «Cobrar» si paga en la tienda): confirmar no cobra.
 * Un pedido en efectivo SIN anticipo sigue igual (su casilla cobra en la caja al confirmar).
 */

const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: jest.fn(() => 358),
  getCurrentBranchId: jest.fn(() => 1),
  getCurrentUserId: jest.fn(async () => 'user-1'),
}));

const mockCrearEnvio = jest.fn(async () => ({ id: 'ship-1' }));
jest.mock('../deliveryIntegrationService', () => ({
  deliveryIntegrationService: { createShipmentFromWebOrder: (...a: unknown[]) => mockCrearEnvio(...(a as [])) },
}));

jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'log').mockImplementation(() => {});

import { seCobraAlEntregar } from '@/lib/pos/pedidosWeb/contraentregaPedido';
import { webOrderConfirmationService } from '../webOrderConfirmationService';

function chain(result: unknown = { data: null, error: null }) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ['select', 'insert', 'update', 'eq', 'neq', 'is', 'in', 'limit', 'order', 'ilike']) {
    c[m] = jest.fn(() => c);
  }
  c.maybeSingle = jest.fn(async () => result);
  c.single = jest.fn(async () => result);
  (c as unknown as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}

const contraentrega = {
  id: 'wo-ant-2',
  organization_id: 358,
  branch_id: 1,
  customer_id: 'cust-1',
  order_number: 'WO-358-PRUEBA2',
  status: 'pending',
  payment_status: 'partial',
  payment_method: 'cash',
  payment_reference: null,
  delivery_type: 'delivery_own',
  advance_amount: 20000,
  advance_status: 'paid',
  total: 200100,
  subtotal: 190000,
  tax_total: 0,
  discount_total: 0,
  delivery_fee: 10100,
  tip_amount: 0,
  coupon_code: null,
  sale_id: null,
  items: [{ product_id: 7, quantity: 1, unit_price: 190000, total: 190000, product_name: 'Zapato' }],
};

describe('seCobraAlEntregar (regla pura)', () => {
  it('contraentrega con anticipo (pagado, pendiente o vencido): se cobra al entregar', () => {
    expect(seCobraAlEntregar(contraentrega)).toBe(true);
    expect(seCobraAlEntregar({ ...contraentrega, advance_status: 'pending', payment_status: 'pending' })).toBe(true);
    expect(seCobraAlEntregar({ ...contraentrega, advance_amount: 0, advance_status: 'expired' })).toBe(true);
  });
  it('efectivo sin anticipo, pasarela o para recoger: no (como siempre)', () => {
    expect(seCobraAlEntregar({ ...contraentrega, advance_amount: null, advance_status: null, payment_status: 'pending' })).toBe(false);
    expect(seCobraAlEntregar({ ...contraentrega, advance_amount: undefined, advance_status: undefined })).toBe(false);
    expect(seCobraAlEntregar({ ...contraentrega, payment_method: 'wompi' })).toBe(false);
    expect(seCobraAlEntregar({ ...contraentrega, delivery_type: 'pickup' })).toBe(false);
  });
});

describe('«Confirmar pedido» con «Marcar como pagado»', () => {
  const ANTES = process.env.NEXT_PUBLIC_WEB_ORDERS_CONFIRMACION_COMPLETA;
  const fetchOriginal = global.fetch;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_WEB_ORDERS_CONFIRMACION_COMPLETA = 'true';
    mockRpc.mockReset();
    mockFrom.mockReset();
    mockFrom.mockImplementation(() => chain());
    mockCrearEnvio.mockClear();
    global.fetch = jest.fn(async () => ({ ok: true, status: 200 })) as never;
    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === 'fn_confirmar_pedido_web_completo') {
        return {
          data: { sale_id: 'sale-1', venta_creada: true, items_creados: 1, kitchen_ticket_id: null, comanda_creada: false, estado_actualizado: true, ya_completo: false, stock: { errores: [] } },
          error: null,
        };
      }
      if (fn === 'fn_cobrar_pedido_web_en_caja') {
        return { data: null, error: { message: 'NO_OPEN_CASH_SESSION' } };
      }
      return { data: null, error: null };
    });
  });
  afterAll(() => {
    process.env.NEXT_PUBLIC_WEB_ORDERS_CONFIRMACION_COMPLETA = ANTES;
    global.fetch = fetchOriginal;
  });

  it('contraentrega con anticipo: confirma sin cobrar en caja y sin aviso de caja', async () => {
    const r = await webOrderConfirmationService.confirmOrder(contraentrega as never, { prepMs: 60_000, transitMs: 60_000, markAsPaid: true });
    const llamadas = mockRpc.mock.calls.map(([fn]) => fn);
    expect(llamadas).not.toContain('fn_cobrar_pedido_web_en_caja');
    expect(r.cobroPendiente).toBeUndefined();
    expect(r.cobro).toBeUndefined();
    expect(r.invoiceId).toBeUndefined();
    expect(r.paymentId).toBeUndefined();
    // Confirma sin pagar (la RPC deja el pedido «Confirmado», `partial`).
    expect(mockRpc).toHaveBeenCalledWith('fn_confirmar_pedido_web_completo', expect.objectContaining({ p_pagado: false, p_marcar_confirmado: true }));
    // Ni factura ni pago desde el navegador.
    const tablas = mockFrom.mock.calls.map(([t]) => t);
    expect(tablas).not.toContain('invoice_sales');
    expect(tablas).not.toContain('payments');
    expect(r.shipmentId).toBe('ship-1');
  });

  it('efectivo SIN anticipo: sigue intentando el cobro en caja como siempre', async () => {
    const sinAnticipo = { ...contraentrega, id: 'wo-cash-1', payment_status: 'pending', advance_amount: null, advance_status: null };
    const r = await webOrderConfirmationService.confirmOrder(sinAnticipo as never, { prepMs: 60_000, transitMs: 60_000, markAsPaid: true });
    expect(mockRpc.mock.calls.map(([fn]) => fn)).toContain('fn_cobrar_pedido_web_en_caja');
    expect(r.cobroPendiente).toBe('NO_OPEN_CASH_SESSION');
  });
});
