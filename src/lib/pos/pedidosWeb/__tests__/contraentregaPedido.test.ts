import {
  bloqueoConfirmarPorAnticipo,
  cobrarAlEntregar,
  esPedidoContraentrega,
  estadoAnticipo,
  minutosParaVencer,
  porCobrarAlEntregar,
} from '../contraentregaPedido';

const base = { status: 'pending', total: 151000, delivery_type: 'delivery_own', payment_status: 'pending', payment_method: 'cash' };

describe('esPedidoContraentrega', () => {
  it('efectivo (o sin método) a domicilio, propio o con transportadora', () => {
    expect(esPedidoContraentrega(base)).toBe(true);
    expect(esPedidoContraentrega({ ...base, delivery_type: 'delivery_third_party' })).toBe(true);
    expect(esPedidoContraentrega({ ...base, payment_method: null })).toBe(true);
    expect(esPedidoContraentrega({ ...base, payment_method: 'cash_on_delivery' })).toBe(true);
  });

  it('recoger, comer aquí, transferencia o pasarela: no', () => {
    expect(esPedidoContraentrega({ ...base, delivery_type: 'pickup' })).toBe(false);
    expect(esPedidoContraentrega({ ...base, delivery_type: 'dine_in' })).toBe(false);
    expect(esPedidoContraentrega({ ...base, payment_method: 'transfer' })).toBe(false);
    expect(esPedidoContraentrega({ ...base, payment_method: 'wompi_co' })).toBe(false);
    expect(esPedidoContraentrega({ ...base, payment_method: 'nequi', payment_reference: 'TX' })).toBe(false);
  });

  it('el anticipo NO convierte el pedido en de pasarela (método cash)', () => {
    expect(esPedidoContraentrega({ ...base, advance_amount: 9000, advance_status: 'paid', payment_status: 'partial' })).toBe(true);
  });
});

describe('estado del anticipo y cobro en la puerta', () => {
  it('cuatro estados', () => {
    expect(estadoAnticipo(base)).toBe('sin_anticipo');
    expect(estadoAnticipo({ ...base, advance_amount: 9000, advance_status: 'pending' })).toBe('pendiente');
    expect(estadoAnticipo({ ...base, advance_amount: 9000, advance_status: 'paid' })).toBe('pagado');
    expect(estadoAnticipo({ ...base, advance_amount: 9000, advance_status: 'expired', status: 'expired' })).toBe('vencido');
    expect(estadoAnticipo({ ...base, advance_amount: '9000.00', advance_status: 'pending', status: 'expired' })).toBe('vencido');
  });

  it('cobrar al entregar = total − anticipo pagado', () => {
    expect(cobrarAlEntregar(base)).toBe(151000);
    expect(cobrarAlEntregar({ ...base, advance_amount: 9000, advance_status: 'pending' })).toBe(151000);
    expect(cobrarAlEntregar({ ...base, advance_amount: 9000, advance_status: 'paid' })).toBe(142000);
  });

  it('minutos para vencer', () => {
    const ahora = new Date('2026-11-24T20:00:00Z');
    expect(minutosParaVencer('2026-11-24T20:28:00Z', ahora)).toBe(28);
    expect(minutosParaVencer('2026-11-24T19:00:00Z', ahora)).toBe(0);
    expect(minutosParaVencer(null, ahora)).toBeNull();
  });

  it('confirmar: bloqueado solo con anticipo pendiente', () => {
    expect(bloqueoConfirmarPorAnticipo(base)).toBeNull();
    expect(bloqueoConfirmarPorAnticipo({ ...base, advance_amount: 9000, advance_status: 'pending' })).toBe('FALTA_ANTICIPO');
    expect(bloqueoConfirmarPorAnticipo({ ...base, advance_amount: 9000, advance_status: 'paid' })).toBeNull();
  });
});

describe('porCobrarAlEntregar', () => {
  it('suma lo que está en la calle', () => {
    const r = porCobrarAlEntregar([
      { ...base, advance_amount: 9000, advance_status: 'paid', payment_status: 'partial' }, // 142.000
      { ...base, total: 74300, status: 'in_delivery' }, // 74.300
      { ...base, total: 50000, status: 'delivered' }, // entregado
      { ...base, total: 60000, advance_amount: 6000, advance_status: 'pending' }, // anticipo pendiente
      { ...base, total: 80000, payment_method: 'wompi_co' }, // pasarela
      { ...base, total: 20000, delivery_type: 'pickup' }, // recoger
      { ...base, total: 30000, payment_status: 'paid' }, // ya cobrado
    ]);
    expect(r).toEqual({ monto: 216300, pedidos: 2 });
  });
});

describe('anticiposDelCuadre', () => {
  it('solo los anticipos pagados, aparte de lo esperado', () => {
    const { anticiposDelCuadre } = jest.requireActual('../contraentregaPedido');
    expect(anticiposDelCuadre([
      { order_number: 'WO-415', advance_amount: '9000.00', advance_status: 'paid', advance_gateway: 'wompi_co' },
      { order_number: 'WO-398', advance_amount: null, advance_status: null },
      { order_number: 'WO-402', advance_amount: 5000, advance_status: 'pending' },
    ])).toEqual({ total: 9000, items: [{ numero: 'WO-415', monto: 9000, pasarela: 'wompi_co' }] });
  });
});
