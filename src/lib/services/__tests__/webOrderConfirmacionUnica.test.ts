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
