/// <reference types="jest" />
/**
 * Pedido del dueño (2026-11-24): «cuando el anticipo aparezca pagado, se pone confirmado el
 * pedido automáticamente».
 *
 * - Regla pura `confirmacionPorAnticipo` (contraentregaPedido.ts): solo la contraentrega con el
 *   anticipo pagado, pago parcial y aún «Pendiente» se confirma; la ya confirmada no se toca.
 * - `confirmarContraentregaConAnticipo` (servidor) confirma con la regla del botón «Confirmar
 *   pedido» para ese pedido: `fn_confirmar_pedido_web_completo` SIN pagar y marcando confirmado,
 *   sin factura, pago ni cartera (el anticipo pasa a la factura al cobrar en la puerta).
 * - Idempotencia: un reintento (pedido ya confirmado, o la RPC dice `ya_completo`) no crea nada.
 * - Si falla, el error sube (el pedido sigue «Pendiente») y queda la nota para el equipo.
 * - El aviso de WhatsApp «confirmado» también sale para este pedido (`confirmadoPorPagoEnLinea`).
 */

const mockCreateClient = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

const mockCrearEnvio = jest.fn();
jest.mock('../deliveryIntegrationService', () => ({
  deliveryIntegrationService: { createShipmentFromWebOrder: (...a: unknown[]) => mockCrearEnvio(...a) },
}));

const mockRedimir = jest.fn(async () => 'red-1');
jest.mock('../cuponPedidoWeb', () => ({ redimirCuponPedidoWeb: (...a: unknown[]) => mockRedimir(...(a as [])) }));

jest.mock('../webOrders/tiemposPedidosServer', () => ({ tiemposAutoConfirmacion: jest.fn(async () => null) }));
jest.mock('../organizationTimezoneService', () => ({ getOrganizationTimezone: jest.fn(async () => 'America/Bogota') }));

jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'log').mockImplementation(() => {});

import type { SupabaseClient } from '@supabase/supabase-js';
import { confirmacionPorAnticipo } from '@/lib/pos/pedidosWeb/contraentregaPedido';
import { webOrderServerConfirmation } from '../webOrderServerConfirmation';
import { confirmadoPorPagoEnLinea } from '../orderStatusEmailService';

const base = {
  id: 'wo-ant-1',
  organization_id: 358,
  branch_id: 1,
  customer_id: 'cust-1',
  order_number: 'WO-358-PRUEBA',
  status: 'pending',
  payment_status: 'partial',
  payment_method: 'cash',
  payment_reference: null,
  delivery_type: 'delivery_own',
  advance_amount: 20000,
  advance_status: 'paid',
  advance_gateway: 'bold_link',
  total: 200100,
  subtotal: 190000,
  tax_total: 0,
  discount_total: 0,
  delivery_fee: 10100,
  tip_amount: 0,
  coupon_code: null,
  sale_id: null,
  created_at: '2026-11-24T22:01:32Z',
  confirmed_by: null,
  items: [{ product_id: 7, quantity: 1, unit_price: 190000, total: 190000, product_name: 'Zapato' }],
};

describe('confirmacionPorAnticipo (regla pura)', () => {
  it('contraentrega pendiente con anticipo pagado → confirmar', () => {
    expect(confirmacionPorAnticipo(base)).toBe('confirmar');
  });
  it('ya confirmada (reintento o confirmación manual) → ya_confirmado', () => {
    for (const status of ['confirmed', 'preparing', 'ready', 'in_delivery', 'delivered']) {
      expect(confirmacionPorAnticipo({ ...base, status })).toBe('ya_confirmado');
    }
  });
  it('anticipo sin pagar, vencido o sin anticipo → no_aplica', () => {
    expect(confirmacionPorAnticipo({ ...base, advance_status: 'pending', payment_status: 'pending' })).toBe('no_aplica');
    expect(confirmacionPorAnticipo({ ...base, advance_status: 'expired', status: 'expired', payment_status: 'failed' })).toBe('no_aplica');
    expect(confirmacionPorAnticipo({ ...base, advance_amount: 0 })).toBe('no_aplica');
  });
  it('pedido cerrado con el anticipo pagado → no_aplica (se reactiva o se devuelve a mano)', () => {
    for (const status of ['cancelled', 'rejected', 'refunded']) {
      expect(confirmacionPorAnticipo({ ...base, status })).toBe('no_aplica');
    }
  });
  it('vencido con el anticipo pagado y sin reactivar → anticipo_vencido (2026-11-25: no confirma, avisa «revisando»)', () => {
    expect(confirmacionPorAnticipo({ ...base, status: 'expired' })).toBe('anticipo_vencido');
  });
  it('pagado completo, de pasarela o para recoger → no_aplica', () => {
    expect(confirmacionPorAnticipo({ ...base, payment_status: 'paid' })).toBe('no_aplica');
    expect(confirmacionPorAnticipo({ ...base, payment_method: 'wompi' })).toBe('no_aplica');
    expect(confirmacionPorAnticipo({ ...base, delivery_type: 'pickup' })).toBe('no_aplica');
  });
});

describe('confirmadoPorPagoEnLinea (aviso de WhatsApp una vez)', () => {
  it('pagado completo o anticipo pagado, ya confirmado', () => {
    expect(confirmadoPorPagoEnLinea({ status: 'confirmed', payment_status: 'paid' })).toBe(true);
    expect(confirmadoPorPagoEnLinea({ status: 'confirmed', payment_status: 'partial', advance_status: 'paid' })).toBe(true);
  });
  it('sin confirmar, o parcial sin anticipo pagado: no', () => {
    expect(confirmadoPorPagoEnLinea({ status: 'pending', payment_status: 'partial', advance_status: 'paid' })).toBe(false);
    expect(confirmadoPorPagoEnLinea({ status: 'confirmed', payment_status: 'partial', advance_status: 'pending' })).toBe(false);
    expect(confirmadoPorPagoEnLinea({ status: 'confirmed', payment_status: 'pending' })).toBe(false);
  });
});

// ── Cliente simulado: registra cada llamada (tabla + operación) ──
interface Registro {
  rpc: Array<{ fn: string; args: Record<string, unknown> }>;
  escrituras: Array<{ tabla: string; op: string; valores: unknown }>;
}

function cliente(opciones: {
  pedido?: Record<string, unknown>;
  completo?: Record<string, unknown> | { error: { message: string; code?: string } };
}) {
  const reg: Registro = { rpc: [], escrituras: [] };
  const from = jest.fn((tabla: string) => {
    const c: Record<string, unknown> = {};
    let resultado: unknown = { data: null, error: null };
    for (const m of ['select', 'eq', 'neq', 'is', 'in', 'not', 'order', 'limit', 'ilike']) {
      c[m] = jest.fn(() => c);
    }
    for (const op of ['insert', 'update', 'upsert', 'delete']) {
      c[op] = jest.fn((valores: unknown) => {
        reg.escrituras.push({ tabla, op, valores });
        return c;
      });
    }
    if (tabla === 'web_orders' && opciones.pedido) resultado = { data: opciones.pedido, error: null };
    if (tabla === 'organizations') resultado = { data: { type_id: 3, created_by: 'owner-1' }, error: null };
    c.single = jest.fn(async () => resultado);
    c.maybeSingle = jest.fn(async () => resultado);
    (c as { then: unknown }).then = (ok: (v: unknown) => unknown) => ok({ data: null, error: null });
    return c;
  });
  const rpc = jest.fn(async (fn: string, args: Record<string, unknown>) => {
    reg.rpc.push({ fn, args });
    if (fn === 'fn_confirmar_pedido_web_completo') {
      const r = opciones.completo ?? {
        sale_id: 'sale-1', venta_creada: true, items_creados: 1, kitchen_ticket_id: null,
        comanda_creada: false, estado_actualizado: true, ya_completo: false, stock: { errores: [] },
      };
      if ('error' in r) return { data: null, error: r.error };
      return { data: r, error: null };
    }
    if (fn === 'fn_membresias_activar_venta') return { data: [], error: null };
    return { data: null, error: null };
  });
  return { db: { from, rpc } as unknown as SupabaseClient, reg };
}

const DINERO = new Set(['invoice_sales', 'invoice_items', 'payments', 'accounts_receivable']);

describe('confirmarContraentregaConAnticipo', () => {
  const previo = process.env.NEXT_PUBLIC_WEB_ORDERS_CONFIRMACION_COMPLETA;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_WEB_ORDERS_CONFIRMACION_COMPLETA = 'true';
    mockCrearEnvio.mockReset().mockResolvedValue({ id: 'ship-1' });
    mockRedimir.mockClear();
  });
  afterAll(() => {
    process.env.NEXT_PUBLIC_WEB_ORDERS_CONFIRMACION_COMPLETA = previo;
  });

  it('confirma como el botón: sin pagar, marcando confirmado, sin factura ni pago', async () => {
    const { db, reg } = cliente({});
    const r = await webOrderServerConfirmation.confirmarContraentregaConAnticipo(db, base as never);
    expect(r.saleId).toBe('sale-1');
    expect(r.shipmentId).toBe('ship-1');
    expect(r.invoiceId).toBeUndefined();
    expect(r.paymentId).toBeUndefined();
    expect(r.membresias).toBeUndefined();

    const completo = reg.rpc.find((x) => x.fn === 'fn_confirmar_pedido_web_completo');
    expect(completo?.args).toMatchObject({
      p_order_id: 'wo-ant-1',
      p_pagado: false,
      p_marcar_confirmado: true,
      p_user_id: 'owner-1',
      p_customer_id: 'cust-1',
    });
    expect(Array.isArray(completo?.args.p_lineas)).toBe(true);
    expect(completo?.args.p_prep_min).toBeGreaterThan(0);
    // Ni factura, ni pago, ni cartera: el anticipo se aplica al cobrar en la puerta.
    expect(reg.escrituras.filter((e) => DINERO.has(e.tabla))).toEqual([]);
    // Ni el stock ni la venta se tocan fuera de la RPC (una sola vez, en su transacción).
    expect(reg.rpc.map((x) => x.fn)).not.toContain('fn_pedido_web_confirmar_stock');
    expect(reg.rpc.map((x) => x.fn)).not.toContain('fn_confirmar_pedido_web');
    // Membresías con el mismo valor que la ruta del botón (sin pagar → null).
    expect(reg.rpc.find((x) => x.fn === 'fn_membresias_activar_venta')?.args.p_pagado).toBeNull();
    // Envío con el cliente de servidor (cod = total − anticipo lo decide contraentregaDePedidoWeb).
    expect(mockCrearEnvio).toHaveBeenCalledWith(expect.objectContaining({ id: 'wo-ant-1' }), expect.objectContaining({ client: db, customerId: 'cust-1' }));
  });

  it('reintento con la venta completa: no crea envío, cupón ni membresías', async () => {
    const { db, reg } = cliente({
      completo: { sale_id: 'sale-1', venta_creada: false, items_creados: 0, kitchen_ticket_id: null, comanda_creada: false, estado_actualizado: false, ya_completo: true, stock: null },
    });
    const r = await webOrderServerConfirmation.confirmarContraentregaConAnticipo(db, { ...base, coupon_code: 'X10' } as never);
    expect(r).toEqual({ saleId: 'sale-1', stockErrors: [] });
    expect(mockCrearEnvio).not.toHaveBeenCalled();
    expect(mockRedimir).not.toHaveBeenCalled();
    expect(reg.rpc.map((x) => x.fn)).not.toContain('fn_membresias_activar_venta');
    expect(reg.escrituras).toEqual([]);
  });

  it('si la RPC falla: el error sube (pedido «Pendiente») y queda la nota para el equipo', async () => {
    const { db, reg } = cliente({ pedido: { internal_notes: 'Nota previa' }, completo: { error: { message: 'PRODUCTO_NO_VENDIBLE' } } });
    await expect(webOrderServerConfirmation.confirmarContraentregaConAnticipo(db, base as never)).rejects.toThrow('PRODUCTO_NO_VENDIBLE');
    const nota = reg.escrituras.find((e) => e.tabla === 'web_orders' && e.op === 'update');
    const texto = (nota?.valores as { internal_notes: string }).internal_notes;
    expect(texto.startsWith('Nota previa\n[CONFIRMACIÓN AUTOMÁTICA FALLIDA ')).toBe(true);
    expect(texto).toContain('PRODUCTO_NO_VENDIBLE');
    expect(texto).toContain('El anticipo sigue pagado');
    // Solo la nota: ni estado, ni dinero.
    expect(reg.escrituras).toHaveLength(1);
    expect(mockCrearEnvio).not.toHaveBeenCalled();
  });

  it('con avisos de stock: confirma igual que el botón y los anota', async () => {
    const { db, reg } = cliente({
      completo: { sale_id: 'sale-1', venta_creada: true, items_creados: 1, kitchen_ticket_id: null, comanda_creada: false, estado_actualizado: true, ya_completo: false, stock: { errores: ['Zapato: sin stock en la sede'] } },
    });
    const r = await webOrderServerConfirmation.confirmarContraentregaConAnticipo(db, base as never);
    expect(r.stockErrors).toEqual(['Zapato: sin stock en la sede']);
    const nota = reg.escrituras.find((e) => e.tabla === 'web_orders' && e.op === 'update');
    expect((nota?.valores as { internal_notes: string }).internal_notes).toContain('CONFIRMADO SOLO CON AVISOS DE STOCK');
  });

  it('sin el interruptor de la confirmación completa: no confirma (como hoy) y lo anota', async () => {
    process.env.NEXT_PUBLIC_WEB_ORDERS_CONFIRMACION_COMPLETA = 'false';
    const { db, reg } = cliente({});
    await expect(webOrderServerConfirmation.confirmarContraentregaConAnticipo(db, base as never)).rejects.toThrow('CONFIRMACION_COMPLETA_INACTIVA');
    expect(reg.rpc).toEqual([]);
    expect(reg.escrituras.map((e) => e.tabla)).toEqual(['web_orders']);
  });
});

describe('autoConfirmPaidOrder con anticipo pagado', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba';
    process.env.NEXT_PUBLIC_WEB_ORDERS_CONFIRMACION_COMPLETA = 'true';
    mockCrearEnvio.mockReset().mockResolvedValue({ id: 'ship-1' });
  });

  it('pendiente → confirma por el camino de la contraentrega (no el de pago completo)', async () => {
    const { db, reg } = cliente({ pedido: base });
    mockCreateClient.mockReturnValue(db);
    const r = await webOrderServerConfirmation.autoConfirmPaidOrder('wo-ant-1');
    expect(r.saleId).toBe('sale-1');
    expect(reg.rpc.find((x) => x.fn === 'fn_confirmar_pedido_web_completo')?.args.p_pagado).toBe(false);
    expect(reg.escrituras.filter((e) => DINERO.has(e.tabla))).toEqual([]);
  });

  it('ya confirmado (reintento del webhook o confirmación manual) → no hace nada', async () => {
    const { db, reg } = cliente({ pedido: { ...base, status: 'confirmed', sale_id: 'sale-9' } });
    mockCreateClient.mockReturnValue(db);
    const r = await webOrderServerConfirmation.autoConfirmPaidOrder('wo-ant-1');
    expect(r).toEqual({ saleId: 'sale-9', stockErrors: [] });
    expect(reg.rpc).toEqual([]);
    expect(reg.escrituras).toEqual([]);
  });

  it('anticipo sin pagar → sigue rechazando como antes', async () => {
    const { db } = cliente({ pedido: { ...base, advance_status: 'pending', payment_status: 'pending' } });
    mockCreateClient.mockReturnValue(db);
    await expect(webOrderServerConfirmation.autoConfirmPaidOrder('wo-ant-1')).rejects.toThrow('no está pagado');
  });
});
