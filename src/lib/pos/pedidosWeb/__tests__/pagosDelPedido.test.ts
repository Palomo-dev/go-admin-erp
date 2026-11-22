/**
 * Tarjeta «Pagos» del pedido online (Figma `2725:192149`): pasarela, submétodo, referencia y
 * estado a partir de las filas de `payments`. Las formas de `processor_response` son las que
 * hay en la base (verificadas por MCP el 2026-11-21); importes y referencias ficticios.
 */
import {
  ordenarPagos,
  pagoPresentable,
  pasarelaDelPago,
  textoMetodoPago,
  tonoEstadoPago,
  type FilaPagoPedido,
} from '@/lib/pos/pedidosWeb/pagosDelPedido';

const base: FilaPagoPedido = {
  id: 'p1',
  method: null,
  amount: '128900',
  status: 'completed',
  payment_date: '2026-11-21T20:12:00Z',
  created_at: '2026-11-21T20:11:00Z',
  reference: null,
  processor: null,
};
const traducir = (s: string) => `«${s}»`;
const etiqueta = (c: string) => `[${c}]`;
const texto = (f: Partial<FilaPagoPedido>) => textoMetodoPago(pagoPresentable({ ...base, ...f }), traducir, etiqueta);

describe('pagoPresentable', () => {
  test('Mercado Pago con tarjeta Visa: marca y últimos 4', () => {
    const p = pagoPresentable({ ...base, method: 'mp', processor: 'mercadopago', reference: 'MP-0001', mp_metodo: 'visa', mp_tipo: 'credit_card', mp_ultimos4: '4417' });
    expect(p).toMatchObject({ pasarela: 'mercadopago', submetodo: 'card', marcaTarjeta: 'Visa', ultimos4: '4417', referencia: 'MP-0001', monto: 128900, estado: 'completed' });
    expect(textoMetodoPago(p, traducir, etiqueta)).toBe('Mercado Pago · Visa ••4417');
  });

  test('Mercado Pago por PSE y por Botón Bancolombia', () => {
    expect(texto({ method: 'pse', processor: 'mercadopago', mp_metodo: 'pse', mp_tipo: 'bank_transfer' })).toBe('Mercado Pago · PSE');
    expect(texto({ method: 'mp', processor: 'mercadopago', mp_metodo: 'boton_bancolombia' })).toBe('Mercado Pago · «botonBancolombia»');
  });

  test('Bold link pagado con Nequi (payment_method es texto)', () => {
    expect(texto({ method: 'bold_link', processor: 'bold', bold_metodo: 'NEQUI' })).toBe('Bold · Nequi');
  });

  test('Wompi sin processor: la pasarela sale de la forma de la respuesta', () => {
    expect(pasarelaDelPago({ ...base, method: 'nequi', wompi_tipo: 'NEQUI' })).toBe('wompi');
    expect(texto({ method: 'nequi', wompi_tipo: 'NEQUI' })).toBe('Wompi · Nequi');
    expect(texto({ method: 'wompi', wompi_tipo: 'CARD', wompi_marca: 'MASTERCARD', wompi_ultimos4: '1234' })).toBe('Wompi · Mastercard ••1234');
    expect(texto({ method: 'transfer', wompi_tipo: 'BANCOLOMBIA_TRANSFER' })).toBe('Wompi · «botonBancolombia»');
  });

  test('el JSON de un objeto en `payment_method` (Wompi/MP) no se toma por código de Bold', () => {
    expect(pasarelaDelPago({ ...base, method: 'card', bold_metodo: '{"type":"CARD","extra":{}}' })).toBeNull();
  });

  test('`processor` manda sobre un `method` incoherente', () => {
    expect(pasarelaDelPago({ ...base, method: 'wompi', processor: 'mercadopago', mp_metodo: 'pse' })).toBe('mercadopago');
  });

  test('marcado a mano: la pasarela del registro manual; submétodo desconocido', () => {
    const p = pagoPresentable({ ...base, method: 'wompi', reference: 'MANUAL-1', manual_pasarela: 'wompi' });
    expect(p).toMatchObject({ pasarela: 'wompi', submetodo: null, referencia: 'MANUAL-1' });
    expect(textoMetodoPago(p, traducir, etiqueta)).toBe('Wompi');
  });

  test('sin pasarela (efectivo, transferencia): la etiqueta del método', () => {
    expect(texto({ method: 'cash' })).toBe('[cash]');
    expect(pagoPresentable({ ...base, method: 'transfer' }).pasarela).toBeNull();
  });

  test('fecha: la del pago; si falta, la de creación. Importe inválido: 0', () => {
    expect(pagoPresentable({ ...base, payment_date: null }).fecha).toBe('2026-11-21T20:11:00Z');
    expect(pagoPresentable({ ...base, amount: 'x' }).monto).toBe(0);
  });
});

describe('estado y orden', () => {
  test('tonos', () => {
    expect(tonoEstadoPago('completed')).toBe('exito');
    expect(tonoEstadoPago('pending')).toBe('advertencia');
    expect(tonoEstadoPago('failed')).toBe('peligro');
  });

  test('varios pagos: aprobados primero, luego pendientes y al final los fallidos; cada grupo por fecha', () => {
    const lista = [
      pagoPresentable({ ...base, id: 'f', status: 'failed', payment_date: '2026-11-21T10:00:00Z' }),
      pagoPresentable({ ...base, id: 'c2', status: 'completed', payment_date: '2026-11-21T12:00:00Z' }),
      pagoPresentable({ ...base, id: 'p', status: 'pending', payment_date: '2026-11-21T09:00:00Z' }),
      pagoPresentable({ ...base, id: 'c1', status: 'completed', payment_date: '2026-11-21T11:00:00Z' }),
    ];
    expect(ordenarPagos(lista).map((p) => p.id)).toEqual(['c1', 'c2', 'p', 'f']);
  });
});
