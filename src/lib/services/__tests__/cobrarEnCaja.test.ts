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

import { CobroEnCajaError, codigoErrorCobro, webOrderConfirmationService } from '../webOrderConfirmationService';

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
