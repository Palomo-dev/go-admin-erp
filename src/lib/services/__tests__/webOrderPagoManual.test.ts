/// <reference types="jest" />
/**
 * Pago manual de pedidos online (20261025134150): reactivar un pedido vencido
 * pagado en Wompi sin webhook. Reglas: estados permitidos, referencia y motivo
 * obligatorios, faltantes de stock sin confirmar y errores con código.
 */
import {
  codigoDeError,
  marcarPedidoWebPagado,
  PagoManualError,
  pendienteDeConfirmar,
  puedeMarcarPagadoManual,
  referenciaValida,
} from '../webOrderPagoManual';

const R = '1578504-1792942441-37635';
const base = { sale_id: null, table_session_id: null, payment_method: 'wompi' } as const;

describe('puedeMarcarPagadoManual', () => {
  it('acepta vencido, pendiente y cancelado con pago fallido', () => {
    expect(puedeMarcarPagadoManual({ ...base, status: 'expired', payment_status: 'failed' })).toBe(true);
    expect(puedeMarcarPagadoManual({ ...base, status: 'pending', payment_status: 'pending' })).toBe(true);
    expect(puedeMarcarPagadoManual({ ...base, status: 'cancelled', payment_status: 'failed' })).toBe(true);
  });
  it('rechaza pagados, con venta, rechazados y cancelados por otra causa', () => {
    expect(puedeMarcarPagadoManual({ ...base, status: 'pending', payment_status: 'paid' })).toBe(false);
    expect(puedeMarcarPagadoManual({ ...base, sale_id: 's1', status: 'expired', payment_status: 'failed' })).toBe(false);
    expect(puedeMarcarPagadoManual({ ...base, status: 'rejected', payment_status: 'failed' })).toBe(false);
    expect(puedeMarcarPagadoManual({ ...base, status: 'cancelled', payment_status: 'pending' })).toBe(false);
    expect(puedeMarcarPagadoManual({ ...base, status: 'confirmed', payment_status: 'pending' })).toBe(false);
  });
  it('pendientes solo de pasarela; vencidos de cualquier método (MEDIO 3)', () => {
    expect(puedeMarcarPagadoManual({ ...base, payment_method: 'cash', status: 'pending', payment_status: 'pending' })).toBe(false);
    expect(puedeMarcarPagadoManual({ ...base, payment_method: 'transfer', status: 'pending', payment_status: 'pending' })).toBe(false);
    expect(puedeMarcarPagadoManual({ ...base, payment_method: 'cash', status: 'cancelled', payment_status: 'failed' })).toBe(false);
    expect(puedeMarcarPagadoManual({ ...base, payment_method: 'nequi', status: 'pending', payment_status: 'pending' })).toBe(true);
    expect(puedeMarcarPagadoManual({ ...base, payment_method: 'card', status: 'pending', payment_status: 'failed' })).toBe(true);
    expect(puedeMarcarPagadoManual({ ...base, payment_method: 'cash', status: 'expired', payment_status: 'failed' })).toBe(true);
  });
  it('pendienteDeConfirmar: pagado sin venta', () => {
    expect(pendienteDeConfirmar({ ...base, status: 'pending', payment_status: 'paid' })).toBe(true);
    expect(pendienteDeConfirmar({ ...base, status: 'pending', payment_status: 'paid', sale_id: 's' })).toBe(false);
    expect(pendienteDeConfirmar({ ...base, status: 'confirmed', payment_status: 'paid' })).toBe(false);
  });
  it('formato de referencia', () => {
    expect(referenciaValida(' 1578504-1792942441-37635 ')).toBe(true);
    expect(referenciaValida('abc')).toBe(false);
    expect(referenciaValida('1578504')).toBe(false);
  });
});

describe('marcarPedidoWebPagado', () => {
  const rpc = jest.fn();
  const client = { rpc } as unknown as Parameters<typeof marcarPedidoWebPagado>[0];
  beforeEach(() => rpc.mockReset());

  it('envía referencia, método y motivo recortados', async () => {
    rpc.mockResolvedValue({ data: { ok: true, ya_pagado: false, stock_reservado: true, payment_id: 'p1', pago_existente: false }, error: null });
    const r = await marcarPedidoWebPagado(client, 'o1', { referencia: ' 1578504-1792942441-37635 ', motivo: ' webhook no llegó ' });
    expect(rpc).toHaveBeenCalledWith('fn_marcar_pedido_web_pagado', {
      p_order_id: 'o1', p_referencia: '1578504-1792942441-37635', p_metodo: 'wompi', p_motivo: 'webhook no llegó',
    });
    expect(r).toEqual({ ok: true, yaPagado: false, stockReservado: true, paymentId: 'p1', pagoExistente: false });
  });

  it('sin referencia o motivo no llama a la base', async () => {
    await expect(marcarPedidoWebPagado(client, 'o1', { referencia: ' ', motivo: 'xxx' })).rejects.toMatchObject({ codigo: 'REFERENCIA_REQUERIDA' });
    await expect(marcarPedidoWebPagado(client, 'o1', { referencia: 'abc', motivo: 'xyz' })).rejects.toMatchObject({ codigo: 'REFERENCIA_INVALIDA' });
    await expect(marcarPedidoWebPagado(client, 'o1', { referencia: '1578504-1792942441-37635', motivo: '' })).rejects.toMatchObject({ codigo: 'MOTIVO_REQUERIDO' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sin stock devuelve los faltantes (no confirma)', async () => {
    rpc.mockResolvedValue({ data: { ok: false, error: 'STOCK_INSUFICIENTE', shortages: [{ product_id: 7, available: 1, requested: 3 }] }, error: null });
    const r = await marcarPedidoWebPagado(client, 'o1', { referencia: R, motivo: 'xyz' });
    expect(r).toEqual({ ok: false, error: 'STOCK_INSUFICIENTE', faltantes: [{ product_id: 7, available: 1, requested: 3 }] });
  });

  it('traduce los errores de la base a códigos', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'PEDIDO_NO_REACTIVABLE' } });
    await expect(marcarPedidoWebPagado(client, 'o1', { referencia: R, motivo: 'xyz' })).rejects.toBeInstanceOf(PagoManualError);
    expect(codigoDeError({ message: 'sin_permiso' })).toBe('SIN_PERMISO');
    expect(codigoDeError({ code: 'PGRST202' })).toBe('FUNCION_AUSENTE');
    expect(codigoDeError({ message: 'boom' })).toBe('OTRO');
  });
});
