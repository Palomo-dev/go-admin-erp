/// <reference types="jest" />
/**
 * F-67 / ADR-CC-011 — un pedido web se confirma una sola vez.
 *
 * Los dos caminos (servidor: webhook, cron y auto-confirm; navegador: botón
 * «Confirmar pedido») crean la venta por `fn_confirmar_pedido_web`, que toma el
 * pedido con FOR UPDATE. Si la venta ya existía, el camino que llega segundo
 * no crea líneas, stock, factura ni pago.
 */

const mockBrowserRpc = jest.fn();
const mockBrowserFrom = jest.fn();

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockBrowserRpc(...args),
    from: (...args: unknown[]) => mockBrowserFrom(...args),
  },
}));

jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: jest.fn(() => 149),
  getCurrentBranchId: jest.fn(() => 129),
  getCurrentUserId: jest.fn(async () => 'user-1'),
}));

jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'log').mockImplementation(() => {});

import { webOrderServerConfirmation } from '../webOrderServerConfirmation';
import { webOrderConfirmationService } from '../webOrderConfirmationService';

function chain(result: unknown = { data: null, error: null }) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ['select', 'insert', 'update', 'eq', 'neq', 'is', 'in', 'limit', 'order']) {
    c[m] = jest.fn(() => c);
  }
  c.maybeSingle = jest.fn(async () => result);
  c.single = jest.fn(async () => result);
  (c as unknown as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}

const pedido = {
  id: 'wo-1',
  organization_id: 149,
  branch_id: 129,
  customer_id: 'cust-1',
  order_number: 'WO-149-PRUEBA',
  payment_status: 'paid',
  payment_reference: 'REF-WOMPI-1',
  total: 20000,
  subtotal: 20000,
  tax_total: 0,
  discount_total: 0,
  delivery_fee: 0,
  tip_amount: 0,
  delivery_type: 'pickup',
  items: [{ product_id: 1, quantity: 1, unit_price: 20000, product_name: 'X' }],
} as never;

describe('F-67 — camino del servidor', () => {
  it('si la venta ya existía no crea nada y deja la referencia en el pago vivo', async () => {
    const tablas: string[] = [];
    const pagos = chain();
    const client = {
      rpc: jest.fn(async (fn: string) =>
        fn === 'fn_confirmar_pedido_web'
          ? { data: { sale_id: 'sale-existente', creada: false }, error: null }
          : { data: null, error: null }
      ),
      from: jest.fn((t: string) => {
        tablas.push(t);
        if (t === 'invoice_sales') return chain({ data: { id: 'inv-1' }, error: null });
        if (t === 'payments') return pagos;
        return chain();
      }),
    };

    const r = await webOrderServerConfirmation.confirmOrder(client as never, pedido);

    expect(r.saleId).toBe('sale-existente');
    expect(client.rpc).toHaveBeenCalledWith('fn_confirmar_pedido_web', expect.objectContaining({
      p_order_id: 'wo-1',
      p_pagado: true,
    }));
    for (const t of ['sales', 'sale_items', 'stock_movements', 'kitchen_tickets']) {
      expect(tablas).not.toContain(t);
    }
    expect(client.rpc).not.toHaveBeenCalledWith('decrement_stock_with_recipe', expect.anything());
    expect(pagos.update).toHaveBeenCalledWith({ reference: 'REF-WOMPI-1' });
    expect(pagos.is).toHaveBeenCalledWith('reference', null);
  });

  it('la venta nunca se inserta directamente en sales', async () => {
    const client = {
      rpc: jest.fn(async () => ({ data: { sale_id: 'sale-nueva', creada: true }, error: null })),
      from: jest.fn<ReturnType<typeof chain>, [string]>(() => chain({ data: { id: 'x', number: 'FACT-1' }, error: null })),
    };
    await webOrderServerConfirmation.confirmOrder(client as never, pedido);
    const inserts = client.from.mock.calls.filter(([t]) => t === 'sales');
    expect(inserts).toHaveLength(0);
  });
});

describe('F-67 — botón «Confirmar pedido»', () => {
  beforeEach(() => {
    mockBrowserRpc.mockReset();
    mockBrowserFrom.mockReset();
    mockBrowserFrom.mockImplementation(() => chain());
  });

  it('si el webhook ya creó la venta, devuelve esa venta y no crea nada', async () => {
    mockBrowserRpc.mockResolvedValue({ data: { sale_id: 'sale-webhook', creada: false }, error: null });

    const r = await webOrderConfirmationService.confirmOrder(pedido, { prepMs: 60000 });

    expect(r).toEqual({ saleId: 'sale-webhook', yaConfirmado: true });
    expect(mockBrowserRpc).toHaveBeenCalledTimes(1);
    expect(mockBrowserFrom).not.toHaveBeenCalled();
  });

  it('un error de la base se muestra, no se oculta', async () => {
    mockBrowserRpc.mockResolvedValue({ data: null, error: { message: 'WEB_ORDER_NOT_FOUND' } });
    await expect(
      webOrderConfirmationService.confirmOrder(pedido, { prepMs: 60000 })
    ).rejects.toThrow('WEB_ORDER_NOT_FOUND');
  });
});

/**
 * Paquete E · E2/E3 — confirmación en UNA transacción, detrás del interruptor
 * NEXT_PUBLIC_WEB_ORDERS_CONFIRMACION_COMPLETA. Reintentar completa lo que
 * falte (pedido huérfano: venta sin líneas ni comanda) y la comanda nace en la
 * base también para lo pagado en línea. Sin la función en la base, el camino
 * de siempre.
 */
describe('Paquete E — confirmación completa (interruptor activo)', () => {
  const ANTES = process.env.NEXT_PUBLIC_WEB_ORDERS_CONFIRMACION_COMPLETA;
  const fetchOriginal = global.fetch;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_WEB_ORDERS_CONFIRMACION_COMPLETA = 'true';
    mockBrowserRpc.mockReset();
    mockBrowserFrom.mockReset();
    mockBrowserFrom.mockImplementation(() => chain());
    global.fetch = jest.fn(async () => ({ ok: true, status: 200 })) as never;
  });
  afterAll(() => {
    process.env.NEXT_PUBLIC_WEB_ORDERS_CONFIRMACION_COMPLETA = ANTES;
    global.fetch = fetchOriginal;
  });

  const completoRpc = (resultado: Record<string, unknown>) =>
    jest.fn(async (fn: string) => {
      if (fn === 'fn_confirmar_pedido_web_completo') return { data: resultado, error: null };
      if (fn === 'organizations') return { data: null, error: null };
      return { data: null, error: null };
    });

  it('servidor: el pedido huérfano (venta sin líneas) se completa por la RPC, con comanda y sin insertar líneas desde Node', async () => {
    const tablas: string[] = [];
    const client = {
      rpc: completoRpc({
        sale_id: 'sale-huerfana', venta_creada: false, items_creados: 1, kitchen_ticket_id: 7,
        comanda_creada: true, estado_actualizado: false, ya_completo: false,
        stock: { errores: ['Producto X: sin insumos de la receta'] },
      }),
      from: jest.fn((t: string) => {
        tablas.push(t);
        if (t === 'organizations') return chain({ data: { type_id: 1, created_by: 'owner-1' }, error: null });
        if (t === 'invoice_sales') return chain({ data: { id: 'inv-1', number: 'FACT-9', currency: 'COP', total: 20000 }, error: null });
        return chain();
      }),
    };

    const r = await webOrderServerConfirmation.confirmOrder(client as never, { ...(pedido as object), sale_id: 'sale-huerfana', status: 'pending' } as never);

    expect(client.rpc).toHaveBeenCalledWith('fn_confirmar_pedido_web_completo', expect.objectContaining({
      p_order_id: 'wo-1',
      p_pagado: true,
      p_marcar_confirmado: false,
      p_prep_min: 30,
      p_lineas: [expect.objectContaining({ product_id: 1, quantity: 1, unit_price: 20000, total: 20000 })],
    }));
    expect(client.rpc).not.toHaveBeenCalledWith('fn_confirmar_pedido_web', expect.anything());
    expect(client.rpc).not.toHaveBeenCalledWith('fn_pedido_web_confirmar_stock', expect.anything());
    expect(tablas).not.toContain('sale_items');
    expect(tablas).not.toContain('kitchen_tickets');
    expect(r.saleId).toBe('sale-huerfana');
    expect(r.stockErrors).toEqual(['Producto X: sin insumos de la receta']);
  });

  it('servidor: si ya estaba completo no crea factura ni pago y conserva la referencia', async () => {
    const pagos = chain();
    const facturas = chain({ data: { id: 'inv-1' }, error: null });
    const client = {
      rpc: completoRpc({ sale_id: 'sale-1', venta_creada: false, items_creados: 0, comanda_creada: false, estado_actualizado: false, ya_completo: true }),
      from: jest.fn((t: string) => {
        if (t === 'organizations') return chain({ data: { type_id: 1 }, error: null });
        if (t === 'invoice_sales') return facturas;
        if (t === 'payments') return pagos;
        return chain();
      }),
    };
    const r = await webOrderServerConfirmation.confirmOrder(client as never, pedido);
    expect(r).toEqual({ saleId: 'sale-1', stockErrors: [] });
    expect(facturas.insert).not.toHaveBeenCalled();
    expect(pagos.insert).not.toHaveBeenCalled();
    expect(pagos.update).toHaveBeenCalledWith({ reference: 'REF-WOMPI-1' });
  });

  it('servidor: sin la función en la base (PGRST202) sigue el camino de siempre', async () => {
    const client = {
      rpc: jest.fn(async (fn: string) =>
        fn === 'fn_confirmar_pedido_web_completo'
          ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
          : fn === 'fn_confirmar_pedido_web'
            ? { data: { sale_id: 'sale-existente', creada: false }, error: null }
            : { data: null, error: null }
      ),
      from: jest.fn((t: string) => (t === 'organizations' ? chain({ data: { type_id: 1 }, error: null }) : chain())),
    };
    const r = await webOrderServerConfirmation.confirmOrder(client as never, pedido);
    expect(client.rpc).toHaveBeenCalledWith('fn_confirmar_pedido_web', expect.anything());
    expect(r.saleId).toBe('sale-existente');
  });

  it('botón: pedido en efectivo sin pagar → la RPC marca el estado y devuelve comanda y errores de stock', async () => {
    mockBrowserRpc.mockImplementation(async (fn: string) =>
      fn === 'fn_confirmar_pedido_web_completo'
        ? { data: { sale_id: 'sale-c', venta_creada: true, items_creados: 1, kitchen_ticket_id: 9, comanda_creada: true, estado_actualizado: true, ya_completo: false, stock: { errores: ['Pan: sin stock'] } }, error: null }
        : { data: null, error: null }
    );
    const efectivo = { ...(pedido as object), payment_status: 'pending', payment_method: 'cash', customer_id: null } as never;

    const r = await webOrderConfirmationService.confirmOrder(efectivo, { prepMs: 20 * 60000 });

    expect(mockBrowserRpc).toHaveBeenCalledWith('fn_confirmar_pedido_web_completo', expect.objectContaining({
      p_pagado: false,
      p_marcar_confirmado: true,
      p_prep_min: 20,
    }));
    expect(r).toEqual(expect.objectContaining({ saleId: 'sale-c', kitchenTicketId: 9, stockErrors: ['Pan: sin stock'], completadoAhora: false }));
    // Sin pagar: ni factura ni actualización del pedido desde el navegador.
    const tablas = mockBrowserFrom.mock.calls.map(([t]) => t);
    expect(tablas).not.toContain('invoice_sales');
    expect(tablas).not.toContain('web_orders');
  });

  it('botón: «Comer aquí» sin pagar con mesa → a la cuenta de la mesa', async () => {
    mockBrowserRpc.mockImplementation(async (fn: string) =>
      fn === 'pos_mesa_agregar_pedido_web'
        ? { data: { ya_completo: false, table_session_id: 'ses-1', sesion_creada: true, sale_id: 'sale-mesa', items_agregados: 1, kitchen_ticket_id: 11, mesa: 'Mesa 4' }, error: null }
        : { data: null, error: null }
    );
    const mesa = { ...(pedido as object), payment_status: 'pending', payment_method: 'cash', delivery_type: 'dine_in', restaurant_table_id: 'mesa-4' } as never;

    const r = await webOrderConfirmationService.confirmOrder(mesa, { prepMs: 15 * 60000 });

    expect(mockBrowserRpc).toHaveBeenCalledWith('pos_mesa_agregar_pedido_web', expect.objectContaining({ p_order_id: 'wo-1', p_prep_min: 15 }));
    expect(mockBrowserRpc).not.toHaveBeenCalledWith('fn_confirmar_pedido_web_completo', expect.anything());
    expect(r).toEqual(expect.objectContaining({ tableSessionId: 'ses-1', kitchenTicketId: 11, yaConfirmado: false }));
  });

  it('botón: reintento sobre el huérfano lo completa y lo dice', async () => {
    mockBrowserRpc.mockImplementation(async (fn: string) =>
      fn === 'fn_confirmar_pedido_web_completo'
        ? { data: { sale_id: 'sale-h', venta_creada: false, items_creados: 1, kitchen_ticket_id: 5, comanda_creada: true, estado_actualizado: true, ya_completo: false }, error: null }
        : { data: null, error: null }
    );
    const efectivo = { ...(pedido as object), payment_status: 'pending', payment_method: 'cash', coupon_code: null, tip_amount: 0 } as never;
    const r = await webOrderConfirmationService.confirmOrder(efectivo, { prepMs: 60000 });
    expect(r.completadoAhora).toBe(true);
    expect(r.yaConfirmado).toBeUndefined();
  });

  it('botón: ya completo → yaConfirmado, sin más escrituras', async () => {
    mockBrowserRpc.mockImplementation(async () => ({
      data: { sale_id: 'sale-x', venta_creada: false, items_creados: 0, comanda_creada: false, estado_actualizado: false, ya_completo: true },
      error: null,
    }));
    const r = await webOrderConfirmationService.confirmOrder(pedido, { prepMs: 60000 });
    expect(r).toEqual({ saleId: 'sale-x', yaConfirmado: true, stockErrors: [] });
    expect(mockBrowserFrom).not.toHaveBeenCalled();
  });
});
