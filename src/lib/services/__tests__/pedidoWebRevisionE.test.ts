/// <reference types="jest" />
/**
 * Paquete E — correcciones de la revisión (2026-10-06).
 *
 * 1. Pedido pagado en línea con la confirmación completa: el sitio ya lo marcó
 *    'confirmed', así que el estado solo avanza desde 'pending', pero los
 *    tiempos estimados se escriben aparte (si faltan): antes no se escribían
 *    nunca y el cliente se quedaba sin «Hora estimada».
 * 2. La casilla «Marcar como pagado» del diálogo de confirmación cobra en la
 *    caja de la sede cuando E4 existe; sin caja, el pedido queda confirmado sin
 *    cobrar y se avisa. Sin E4, el camino de siempre.
 * 3. El cobro en lote no se corta en el primer pedido que no se puede cobrar.
 * 4. Una sola lista de métodos de cobro en caja (nequi/daviplata → transfer).
 * 5. El cron reconoce el pedido pagado «a medias» aunque esté 'confirmed'.
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
  getOrganizationId: jest.fn(() => 140),
  getCurrentBranchId: jest.fn(() => 115),
  getCurrentUserId: jest.fn(async () => 'cajero-1'),
}));

jest.mock('@/lib/utils/invoiceUtils', () => ({
  generateInvoiceNumber: jest.fn(async () => 'FACT-0100'),
  generateInvoiceNumberWithClient: jest.fn(async () => 'FACT-0101'),
}));

jest.mock('@/lib/services/taxResolver', () => ({
  resolveLineTax: jest.fn(async (input: { qty: number; unitPrice: number; discountAmount: number; taxIncluded: boolean }) => ({
    tax_rate: 0,
    tax_code: null,
    tax_included: input.taxIncluded,
    total_line: input.qty * input.unitPrice - input.discountAmount,
    has_no_tax: true,
  })),
  resolveLineTaxWith: jest.fn(async (_c: unknown, input: { qty: number; unitPrice: number; discountAmount: number; taxIncluded: boolean }) => ({
    tax_rate: 0,
    tax_code: null,
    tax_included: input.taxIncluded,
    total_line: input.qty * input.unitPrice - input.discountAmount,
    has_no_tax: true,
  })),
}));

jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'log').mockImplementation(() => {});

import { webOrderServerConfirmation } from '../webOrderServerConfirmation';
import { CobroEnCajaError, claveAvisoCobro, webOrderConfirmationService } from '../webOrderConfirmationService';
import { metodoDeCobroEnCaja, METODOS_COBRO_EN_CAJA } from '@/lib/pos/pedidosWeb/metodosCaja';
import { esPedidoAMedias, filtrarAMedias } from '@/lib/pos/pedidosWeb/pedidosAMedias';

type Chain = Record<string, jest.Mock> & { tabla: string };

function chain(tabla: string, result: unknown = { data: null, error: null }): Chain {
  const c = { tabla } as Chain;
  for (const m of ['select', 'insert', 'update', 'eq', 'neq', 'is', 'in', 'not', 'limit', 'order', 'gte', 'lte']) {
    c[m] = jest.fn(() => c);
  }
  c.maybeSingle = jest.fn(async () => result);
  c.single = jest.fn(async () => result);
  (c as unknown as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}

const base = {
  id: 'wo-1',
  organization_id: 140,
  branch_id: 115,
  customer_id: null,
  order_number: 'W-1043',
  payment_reference: null,
  total: 30000,
  subtotal: 30000,
  tax_total: 0,
  discount_total: 0,
  delivery_fee: 0,
  tip_amount: 0,
  coupon_code: null,
  delivery_type: 'pickup',
  items: [{ product_id: 1, quantity: 1, unit_price: 30000, product_name: 'Plato' }],
};

const ANTES = process.env.NEXT_PUBLIC_WEB_ORDERS_CONFIRMACION_COMPLETA;
const fetchOriginal = global.fetch;
beforeEach(() => {
  process.env.NEXT_PUBLIC_WEB_ORDERS_CONFIRMACION_COMPLETA = 'true';
  mockRpc.mockReset();
  mockFrom.mockReset();
  mockFrom.mockImplementation((t: string) => chain(t));
  (webOrderConfirmationService as unknown as { cobroEnCajaExiste: boolean | null }).cobroEnCajaExiste = null;
  global.fetch = jest.fn(async () => ({ ok: true, status: 200 })) as never;
});
afterAll(() => {
  process.env.NEXT_PUBLIC_WEB_ORDERS_CONFIRMACION_COMPLETA = ANTES;
  global.fetch = fetchOriginal;
});

describe('servidor: pedido pagado en línea (el sitio ya lo marcó confirmed)', () => {
  it('el estado solo avanza desde pending y los tiempos estimados se escriben aparte si faltan', async () => {
    const pedidos: Chain[] = [];
    const client = {
      rpc: jest.fn(async (fn: string) =>
        fn === 'fn_confirmar_pedido_web_completo'
          ? { data: { sale_id: 'sale-1', venta_creada: true, items_creados: 1, kitchen_ticket_id: 3, comanda_creada: true, estado_actualizado: false, ya_completo: false }, error: null }
          : { data: null, error: null },
      ),
      from: jest.fn((t: string) => {
        if (t === 'organizations') return chain(t, { data: { type_id: 1, created_by: 'owner' }, error: null });
        if (t === 'invoice_sales') return chain(t, { data: { id: 'inv-1', number: 'FACT-1', currency: 'COP', total: 30000 }, error: null });
        const c = chain(t);
        if (t === 'web_orders') pedidos.push(c);
        return c;
      }),
    };

    await webOrderServerConfirmation.confirmOrder(client as never, { ...base, status: 'confirmed', payment_status: 'paid', payment_method: 'nequi' } as never);

    const updates = pedidos.filter((c) => c.update.mock.calls.length > 0);
    const estado = updates.find((c) => 'status' in (c.update.mock.calls[0][0] as object));
    const tiempos = updates.find((c) => 'estimated_ready_at' in (c.update.mock.calls[0][0] as object));
    expect(estado).toBeDefined();
    expect(estado!.eq).toHaveBeenCalledWith('status', 'pending');
    expect(estado!.update.mock.calls[0][0]).not.toHaveProperty('estimated_ready_at');
    expect(tiempos).toBeDefined();
    expect(tiempos!.update.mock.calls[0][0]).toHaveProperty('estimated_ready_at');
    expect(tiempos!.eq).not.toHaveBeenCalledWith('status', 'pending');
    expect(tiempos!.in).toHaveBeenCalledWith('status', ['pending', 'confirmed']);
    expect(tiempos!.is).toHaveBeenCalledWith('estimated_ready_at', null);
  });

  it('reintento con la factura reutilizada: no crea un segundo pago', async () => {
    const pagos: Chain[] = [];
    const client = {
      rpc: jest.fn(async (fn: string) =>
        fn === 'fn_confirmar_pedido_web_completo'
          ? { data: { sale_id: 'sale-1', venta_creada: false, items_creados: 0, kitchen_ticket_id: 3, comanda_creada: true, estado_actualizado: false, ya_completo: false }, error: null }
          : { data: null, error: null },
      ),
      from: jest.fn((t: string) => {
        if (t === 'organizations') return chain(t, { data: { type_id: 1, created_by: 'owner' }, error: null });
        if (t === 'invoice_sales') return chain(t, { data: { id: 'inv-1', number: 'FACT-1', currency: 'COP' }, error: null });
        if (t === 'payments') {
          const c = chain(t, { data: { id: 'pago-1' }, error: null });
          pagos.push(c);
          return c;
        }
        return chain(t);
      }),
    };
    const r = await webOrderServerConfirmation.confirmOrder(client as never, { ...base, status: 'confirmed', payment_status: 'paid' } as never);
    expect(r.paymentId).toBe('pago-1');
    expect(pagos.some((c) => c.insert.mock.calls.length > 0)).toBe(false);
  });
});

describe('diálogo «Confirmar» con «Marcar como pagado»', () => {
  const efectivo = { ...base, status: 'pending', payment_status: 'pending', payment_method: 'nequi' } as never;
  const rpcCon = (cobro: (args: Record<string, unknown>) => unknown) =>
    mockRpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'fn_confirmar_pedido_web_completo') {
        return { data: { sale_id: 'sale-c', venta_creada: true, items_creados: 1, kitchen_ticket_id: 9, comanda_creada: true, estado_actualizado: true, ya_completo: false }, error: null };
      }
      if (fn === 'fn_cobrar_pedido_web_en_caja') return cobro(args);
      return { data: null, error: null };
    });

  it('con E4: confirma sin pagar y cobra en la caja de la sede (nequi → transfer), sin escribir paid desde el navegador', async () => {
    rpcCon((args) =>
      args.p_order_id === '00000000-0000-0000-0000-000000000000'
        ? { data: null, error: { code: 'P0002', message: 'WEB_ORDER_NOT_FOUND' } }
        : { data: { ya_cobrado: false, invoice_id: 'inv-9', invoice_number: 'FACT-0100', payment_id: 'pay-9', cash_session_id: 82 }, error: null },
    );
    const r = await webOrderConfirmationService.confirmOrder(efectivo, { prepMs: 60000, markAsPaid: true });

    expect(mockRpc).toHaveBeenCalledWith('fn_confirmar_pedido_web_completo', expect.objectContaining({ p_pagado: false, p_marcar_confirmado: true }));
    expect(mockRpc).toHaveBeenCalledWith('fn_cobrar_pedido_web_en_caja', expect.objectContaining({ p_order_id: 'wo-1', p_metodo: 'transfer' }));
    expect(r.cobro).toEqual(expect.objectContaining({ cashSessionId: 82, paymentId: 'pay-9' }));
    expect(r.paymentId).toBe('pay-9');
    const updatesPedido = mockFrom.mock.results
      .map((x) => x.value as Chain)
      .filter((c) => c.tabla === 'web_orders' && c.update.mock.calls.length > 0);
    expect(updatesPedido).toHaveLength(0);
  });

  it('con E4 y sin caja abierta: el pedido queda confirmado sin cobrar y se avisa', async () => {
    rpcCon((args) =>
      args.p_order_id === '00000000-0000-0000-0000-000000000000'
        ? { data: null, error: { code: 'P0002', message: 'WEB_ORDER_NOT_FOUND' } }
        : { data: null, error: { code: 'P0001', message: 'NO_OPEN_CASH_SESSION' } },
    );
    const r = await webOrderConfirmationService.confirmOrder(efectivo, { prepMs: 60000, markAsPaid: true });
    expect(r.saleId).toBe('sale-c');
    expect(r.cobroPendiente).toBe('NO_OPEN_CASH_SESSION');
    expect(claveAvisoCobro(r.cobroPendiente!)).toBe('sinCaja');
  });

  it('sin E4 (PGRST202): el camino de siempre, pagado con factura', async () => {
    rpcCon(() => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }));
    await webOrderConfirmationService.confirmOrder(efectivo, { prepMs: 60000, markAsPaid: true });
    expect(mockRpc).toHaveBeenCalledWith('fn_confirmar_pedido_web_completo', expect.objectContaining({ p_pagado: true, p_marcar_confirmado: false }));
    expect(mockRpc.mock.calls.filter(([fn]) => fn === 'fn_cobrar_pedido_web_en_caja')).toHaveLength(1); // solo la sonda
  });
});

describe('cobro en lote', () => {
  it('no se corta: cobra lo que puede y resume el resto por motivo', async () => {
    const pedidos = [
      { ...base, id: 'a', order_number: 'W-1', payment_method: 'cash' },
      { ...base, id: 'b', order_number: 'W-2', payment_method: 'cash' },
      { ...base, id: 'c', order_number: 'W-3', payment_method: 'daviplata' },
      { ...base, id: 'd', order_number: 'W-4', payment_method: 'cash' },
    ] as never[];
    const errores: Record<string, string> = { b: 'PEDIDO_SIN_CONFIRMAR', d: 'COBRAR_EN_LA_MESA' };
    mockRpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn !== 'fn_cobrar_pedido_web_en_caja') return { data: null, error: null };
      const e = errores[args.p_order_id as string];
      return e ? { data: null, error: { code: 'P0001', message: e } } : { data: { payment_id: 'p', invoice_id: 'i', cash_session_id: 1 }, error: null };
    });
    const cargar = jest.fn(async (id: string) => (pedidos as Array<{ id: string }>).find((p) => p.id === id) as never);

    const r = await webOrderConfirmationService.cobrarVariosEnCaja(pedidos, cargar);

    expect(r.cobrados).toEqual(['W-1', 'W-3']);
    expect(r.pendientes).toEqual({ PEDIDO_SIN_CONFIRMAR: ['W-2'], COBRAR_EN_LA_MESA: ['W-4'] });
    expect(mockRpc).toHaveBeenCalledWith('fn_cobrar_pedido_web_en_caja', expect.objectContaining({ p_order_id: 'c', p_metodo: 'transfer' }));
  });

  it('el código de error del cobro se traduce a una clave de aviso', () => {
    expect(claveAvisoCobro(new CobroEnCajaError('METODO_INVALIDO', 'x').codigo)).toBe('metodoInvalido');
    expect(claveAvisoCobro('OTRO')).toBe('error');
  });
});

describe('métodos de cobro en caja', () => {
  it('una sola lista, sin métodos inactivos en payment_methods', () => {
    expect(METODOS_COBRO_EN_CAJA).toEqual(['cash', 'card', 'transfer', 'qr']);
    expect(metodoDeCobroEnCaja('nequi')).toBe('transfer');
    expect(metodoDeCobroEnCaja('daviplata')).toBe('transfer');
    expect(metodoDeCobroEnCaja('card')).toBe('card');
    expect(metodoDeCobroEnCaja('wompi')).toBe('cash');
    expect(metodoDeCobroEnCaja(null)).toBe('cash');
  });
});

describe('cron: pedidos pagados a medias', () => {
  const ev = { ventasConLineas: new Set(['s-con']), ventasConComanda: new Set(['s-con']), organizacionesRestaurante: new Set([140]) };
  it('venta sin líneas, o restaurante sin comanda, aunque el pedido esté confirmed', () => {
    const c = (sale_id: string | null, organization_id = 140) => ({ id: 'x', order_number: 'W', organization_id, created_at: '', sale_id });
    expect(esPedidoAMedias(c('s-sin'), ev)).toBe(true);
    expect(esPedidoAMedias(c('s-con'), ev)).toBe(false);
    expect(esPedidoAMedias(c(null), ev)).toBe(false);
    const sinComanda = { ...ev, ventasConComanda: new Set<string>() };
    expect(esPedidoAMedias(c('s-con'), sinComanda)).toBe(true);
    expect(esPedidoAMedias(c('s-con', 3), sinComanda)).toBe(false);
  });

  it('lee la evidencia en lote y, si falla, no reintenta nada', async () => {
    const candidatos = [
      { id: 'a', order_number: 'W-1', organization_id: 140, created_at: '', sale_id: 's1' },
      { id: 'b', order_number: 'W-2', organization_id: 140, created_at: '', sale_id: 's2' },
    ];
    const cliente = {
      from: jest.fn((t: string) =>
        t === 'sale_items'
          ? chain(t, { data: [{ sale_id: 's1' }], error: null })
          : t === 'kitchen_tickets'
            ? chain(t, { data: [{ sale_id: 's1' }], error: null })
            : chain(t, { data: [{ id: 140, type_id: 1 }], error: null }),
      ),
    };
    expect((await filtrarAMedias(cliente as never, candidatos)).map((c) => c.id)).toEqual(['b']);
    const roto = { from: jest.fn((t: string) => chain(t, { data: null, error: { message: 'x' } })) };
    expect(await filtrarAMedias(roto as never, candidatos)).toEqual([]);
  });
});
