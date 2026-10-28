/// <reference types="jest" />
/**
 * Paquete E · E4 — «Cobrar y entregar»: el pedido web pagado en el local entra
 * a la caja de la sede por UNA RPC (`fn_cobrar_pedido_web_en_caja`).
 *
 * - Con factura previa no se arma otra (no se consume otro consecutivo).
 * - Sin factura, número y líneas salen de la regla única (webOrderTotals): la
 *   base solo las inserta; la suma de las líneas reproduce el total cobrado.
 * - Sin caja abierta: error con código para que la UI diga «Abre la caja».
 * - Sin la función en la base (migración pendiente): FUNCION_AUSENTE, y la UI
 *   usa el respaldo de siempre.
 * - Reintento: la base responde ya_cobrado y no hay un segundo pago.
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
  generateInvoiceNumber: jest.fn(async () => 'FACT-0042'),
}));

jest.mock('@/lib/services/taxResolver', () => ({
  resolveLineTax: jest.fn(async (input: { qty: number; unitPrice: number; discountAmount: number; taxIncluded: boolean }) => ({
    tax_rate: 0,
    tax_code: null,
    tax_included: input.taxIncluded,
    total_line: input.qty * input.unitPrice - input.discountAmount,
    has_no_tax: true,
  })),
}));

jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});

import { claveAvisoCobro, CobroEnCajaError, codigoErrorCobro, webOrderConfirmationService } from '../webOrderConfirmationService';

function chain(result: unknown = { data: null, error: null }) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ['select', 'insert', 'update', 'eq', 'neq', 'is', 'in', 'limit', 'order']) {
    c[m] = jest.fn(() => c);
  }
  c.maybeSingle = jest.fn(async () => result);
  c.single = jest.fn(async () => result);
  return c;
}

const pedido = {
  id: 'wo-cash',
  organization_id: 140,
  branch_id: 115,
  order_number: 'WO-140-CAJA',
  status: 'ready',
  payment_status: 'pending',
  payment_method: 'cash',
  sale_id: 'sale-cash',
  subtotal: 30000,
  tax_total: 0,
  discount_total: 5000,
  delivery_fee: 0,
  tip_amount: 2000,
  total: 27000,
  delivery_type: 'pickup',
  items: [
    { product_id: 1, quantity: 2, unit_price: 10000, product_name: 'Hamburguesa' },
    { product_id: 2, quantity: 1, unit_price: 10000, product_name: 'Limonada' },
  ],
} as never;

beforeEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
});

describe('cobrarEnCaja', () => {
  it('con factura previa no arma otra y cobra por la RPC', async () => {
    mockFrom.mockImplementation(() => chain({ data: { id: 'inv-existente' }, error: null }));
    mockRpc.mockResolvedValue({
      data: { ya_cobrado: false, invoice_id: 'inv-existente', invoice_number: 'FACT-0007', payment_id: 'pay-1', cash_session_id: 82 },
      error: null,
    });

    const r = await webOrderConfirmationService.cobrarEnCaja(pedido, { metodo: 'cash' });

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('fn_cobrar_pedido_web_en_caja', {
      p_order_id: 'wo-cash',
      p_metodo: 'cash',
      p_factura: null,
      p_referencia: null,
      p_monto: null,
    });
    expect(r).toEqual({ invoiceId: 'inv-existente', invoiceNumber: 'FACT-0007', paymentId: 'pay-1', cashSessionId: 82, yaCobrado: false });
  });

  it('sin factura: número y líneas de la regla única; las líneas suman el total cobrado', async () => {
    mockFrom.mockImplementation(() => chain({ data: null, error: null }));
    mockRpc.mockResolvedValue({ data: { ya_cobrado: false, invoice_id: 'inv-n', invoice_number: 'FACT-0042', payment_id: 'pay-n', cash_session_id: 82 }, error: null });

    await webOrderConfirmationService.cobrarEnCaja(pedido, { metodo: 'cash' });

    const factura = mockRpc.mock.calls[0][1].p_factura as { number: string; total: number; lineas: Array<Record<string, unknown>> };
    expect(factura.number).toBe('FACT-0042');
    expect(factura.total).toBe(27000);
    const suma = factura.lineas.reduce((s, l) => s + Number(l.total_line), 0);
    expect(Math.round(suma * 100) / 100).toBe(27000);
    // Propina como línea propia; ninguna línea lleva invoice_id (lo pone la base).
    expect(factura.lineas.some((l) => l.description === 'Propina')).toBe(true);
    for (const l of factura.lineas) {
      expect(l).not.toHaveProperty('invoice_id');
      expect(l).not.toHaveProperty('invoice_sales_id');
    }
  });

  it('sin caja abierta en la sede: NO_OPEN_CASH_SESSION', async () => {
    mockFrom.mockImplementation(() => chain({ data: { id: 'inv-1' }, error: null }));
    mockRpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'NO_OPEN_CASH_SESSION' } });

    await expect(webOrderConfirmationService.cobrarEnCaja(pedido, { metodo: 'cash' })).rejects.toMatchObject({
      name: 'CobroEnCajaError',
      codigo: 'NO_OPEN_CASH_SESSION',
    });
  });

  it('sin la función en la base: FUNCION_AUSENTE (la UI usa el respaldo)', async () => {
    mockFrom.mockImplementation(() => chain({ data: { id: 'inv-1' }, error: null }));
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fn_cobrar_pedido_web_en_caja' } });

    const error = await webOrderConfirmationService.cobrarEnCaja(pedido, { metodo: 'cash' }).catch((e) => e);
    expect(error).toBeInstanceOf(CobroEnCajaError);
    expect((error as CobroEnCajaError).codigo).toBe('FUNCION_AUSENTE');
  });

  it('reintento: la base dice ya_cobrado y no hay segundo pago', async () => {
    mockFrom.mockImplementation(() => chain({ data: { id: 'inv-1' }, error: null }));
    mockRpc.mockResolvedValue({ data: { ya_cobrado: true, invoice_id: 'inv-1', invoice_number: 'FACT-0007', payment_id: 'pay-1', cash_session_id: 82 }, error: null });
    const r = await webOrderConfirmationService.cobrarEnCaja(pedido, { metodo: 'cash' });
    expect(r.yaCobrado).toBe(true);
    expect(r.paymentId).toBe('pay-1');
  });

  it('códigos de error estables', () => {
    expect(codigoErrorCobro({ message: 'COBRAR_EN_LA_MESA' })).toBe('COBRAR_EN_LA_MESA');
    expect(codigoErrorCobro({ message: 'PEDIDO_SIN_CONFIRMAR' })).toBe('PEDIDO_SIN_CONFIRMAR');
    expect(codigoErrorCobro({ code: '42883', message: 'function does not exist' })).toBe('FUNCION_AUSENTE');
    expect(codigoErrorCobro({ message: 'otra cosa' })).toBe('OTRO');
  });
});

describe('pedido pagado por pasarela (WO-335-MVRDVAGK-MRHJ)', () => {
  const pagadoWompi = { ...(pedido as object), id: 'wo-wompi', payment_status: 'paid', payment_method: 'wompi', sale_id: 'sale-w' } as never;

  beforeEach(() => {
    mockRpc.mockReset();
    mockFrom.mockReset();
  });

  it('cobrarEnCaja RECHAZA un pedido de pasarela pagado (PEDIDO_DE_PASARELA) sin llamar a la RPC', async () => {
    await expect(webOrderConfirmationService.cobrarEnCaja(pagadoWompi, { metodo: 'cash' })).rejects.toMatchObject({
      codigo: 'PEDIDO_DE_PASARELA',
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it.each(['wompi', 'nequi', 'daviplata', 'card', 'pse', 'bancolombia_transfer'])(
    'cobrarEnCaja RECHAZA un pedido %s sin pagar (también vencido): nunca efectivo',
    async (payment_method) => {
      const o = { ...(pagadoWompi as object), payment_status: 'pending', status: 'expired', payment_method } as never;
      await expect(webOrderConfirmationService.cobrarEnCaja(o, { metodo: 'cash' })).rejects.toMatchObject({
        codigo: 'PEDIDO_DE_PASARELA',
      });
      expect(mockRpc).not.toHaveBeenCalled();
    },
  );

  it('la base también rechaza: el error PEDIDO_DE_PASARELA de la RPC se mapea y traduce', () => {
    expect(codigoErrorCobro({ message: 'PEDIDO_DE_PASARELA' })).toBe('PEDIDO_DE_PASARELA');
    expect(claveAvisoCobro('PEDIDO_DE_PASARELA')).toBe('dePasarela');
    expect(codigoErrorCobro({ message: 'NO_ES_PASARELA' })).toBe('NO_ES_PASARELA');
    expect(codigoErrorCobro({ message: 'SIN_PERMISO' })).toBe('SIN_PERMISO');
  });

  it('método de caja inválido (no del diálogo) se rechaza antes de la RPC', async () => {
    await expect(webOrderConfirmationService.cobrarEnCaja(pedido, { metodo: 'wompi' })).rejects.toMatchObject({
      codigo: 'METODO_INVALIDO',
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('el cobro en lote lo salta y no crea pago', async () => {
    mockFrom.mockReturnValue(chain());
    const r = await webOrderConfirmationService.cobrarVariosEnCaja([pagadoWompi], async () => pagadoWompi);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(r.cobrados).toEqual([]);
    expect(r.yaPagadosPasarela).toEqual(['WO-140-CAJA']);
  });

  it('pendiente por Wompi/nequi en lote: no se cobra como efectivo (PEDIDO_DE_PASARELA)', async () => {
    const pendiente = { ...(pagadoWompi as object), payment_status: 'pending', payment_method: 'nequi' } as never;
    const r = await webOrderConfirmationService.cobrarVariosEnCaja([pendiente], async () => pendiente);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(r.pendientes.PEDIDO_DE_PASARELA).toEqual(['WO-140-CAJA']);
  });
});

describe('«Marcar como pagado» de un clic (pasarela, sin caja)', () => {
  const confirmadoWompi = {
    ...(pedido as object), id: 'wo-wompi', payment_status: 'pending', payment_method: 'wompi', sale_id: 'sale-w',
  } as never;

  beforeEach(() => {
    mockRpc.mockReset();
    mockFrom.mockReset();
  });

  it('una sola RPC, sin método, referencia ni comprobante; con factura existente no arma otra', async () => {
    mockFrom.mockReturnValue(chain({ data: { id: 'inv-w' }, error: null }));
    mockRpc.mockResolvedValue({
      data: { ok: true, ya_pagado: false, invoice_id: 'inv-w', invoice_number: 'FACT-0003', payment_id: 'pay-w' },
      error: null,
    });
    const r = await webOrderConfirmationService.marcarPagadoPasarela(confirmadoWompi);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('fn_marcar_pedido_web_pagado_pasarela', { p_order_id: 'wo-wompi', p_factura: null });
    expect(mockRpc).not.toHaveBeenCalledWith('fn_cobrar_pedido_web_en_caja', expect.anything());
    expect(r).toEqual({ invoiceId: 'inv-w', invoiceNumber: 'FACT-0003', paymentId: 'pay-w', yaPagado: false });
  });

  it('sin factura: la arma con la regla única (número y líneas) para la RPC', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: null }));
    mockRpc.mockResolvedValue({ data: { ok: true, ya_pagado: false, invoice_id: 'inv-n', payment_id: 'pay-n' }, error: null });
    await webOrderConfirmationService.marcarPagadoPasarela({ ...(confirmadoWompi as object), payment_method: 'nequi' } as never);
    const [, args] = mockRpc.mock.calls[0];
    expect(args.p_factura).toEqual(expect.objectContaining({ number: 'FACT-0042', total: 27000 }));
    expect(Array.isArray(args.p_factura.lineas)).toBe(true);
  });

  it('idempotente: dos clics → la base responde ya_pagado y no hay segundo pago', async () => {
    mockFrom.mockReturnValue(chain({ data: { id: 'inv-w' }, error: null }));
    mockRpc
      .mockResolvedValueOnce({ data: { ok: true, ya_pagado: false, invoice_id: 'inv-w', payment_id: 'pay-w' }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, ya_pagado: true, invoice_id: 'inv-w', payment_id: 'pay-w' }, error: null });
    const r1 = await webOrderConfirmationService.marcarPagadoPasarela(confirmadoWompi);
    const r2 = await webOrderConfirmationService.marcarPagadoPasarela(confirmadoWompi);
    expect(r1.yaPagado).toBe(false);
    expect(r2).toMatchObject({ yaPagado: true, paymentId: 'pay-w' });
  });

  it('no pasarela (efectivo): NO_ES_PASARELA sin llamar a la base', async () => {
    await expect(webOrderConfirmationService.marcarPagadoPasarela(pedido)).rejects.toMatchObject({ codigo: 'NO_ES_PASARELA' });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('sin confirmar: PEDIDO_SIN_CONFIRMAR (el detalle confirma primero)', async () => {
    const sinVenta = { ...(confirmadoWompi as object), sale_id: null } as never;
    await expect(webOrderConfirmationService.marcarPagadoPasarela(sinVenta)).rejects.toMatchObject({ codigo: 'PEDIDO_SIN_CONFIRMAR' });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('error de permiso de la base: SIN_PERMISO', async () => {
    mockFrom.mockReturnValue(chain({ data: { id: 'inv-w' }, error: null }));
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'SIN_PERMISO' } });
    await expect(webOrderConfirmationService.marcarPagadoPasarela(confirmadoWompi)).rejects.toMatchObject({ codigo: 'SIN_PERMISO' });
  });
});
