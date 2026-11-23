import { contraentregaDePedidoWeb, esCodigoEntregaValido, esMedioCobroContraentrega } from '../contraentrega';
import {
  cotizacionPermiteDomicilio,
  direccionParaCotizar,
  direccionUbicable,
  leerCotizacion,
  normalizarBarrio,
  normalizarCodigoDane,
} from '../cotizacion';

describe('contraentregaDePedidoWeb', () => {
  it('pedido sin pagar en efectivo (o sin método): contraentrega por el total', () => {
    expect(contraentregaDePedidoWeb({ total: 58900, payment_status: 'pending', payment_method: 'cash' }))
      .toEqual({ cod_amount: 58900, cod_status: 'pending' });
    expect(contraentregaDePedidoWeb({ total: '1000.50', payment_status: 'pending' }))
      .toEqual({ cod_amount: 1000.5, cod_status: 'pending' });
    expect(contraentregaDePedidoWeb({ total: 20000, payment_method: 'cash_on_delivery' }).cod_amount).toBe(20000);
  });

  it('pedido pagado: sin contraentrega', () => {
    expect(contraentregaDePedidoWeb({ total: 58900, payment_status: 'paid', payment_method: 'cash' }))
      .toEqual({ cod_amount: 0, cod_status: null });
  });

  it('pedido de pasarela sin pagar NO es contraentrega (es un pago en línea pendiente o fallido)', () => {
    expect(contraentregaDePedidoWeb({ total: 58900, payment_status: 'pending', payment_method: 'wompi' }).cod_amount).toBe(0);
    expect(contraentregaDePedidoWeb({ total: 58900, payment_status: 'failed', payment_method: 'nequi' }).cod_amount).toBe(0);
    // Referencia de una pasarela futura con un método desconocido
    expect(contraentregaDePedidoWeb({ total: 100, payment_method: 'otra_pasarela', payment_reference: 'TX-1' }).cod_amount).toBe(0);
  });

  it('total cero o inválido: sin contraentrega', () => {
    expect(contraentregaDePedidoWeb({ total: 0 }).cod_amount).toBe(0);
    expect(contraentregaDePedidoWeb({ total: 'abc' }).cod_amount).toBe(0);
  });
});

describe('código de entrega y medios', () => {
  it('4 dígitos exactos', () => {
    expect(esCodigoEntregaValido('0042')).toBe(true);
    expect(esCodigoEntregaValido(' 1234 ')).toBe(true);
    expect(esCodigoEntregaValido('123')).toBe(false);
    expect(esCodigoEntregaValido('12a4')).toBe(false);
    expect(esCodigoEntregaValido(1234)).toBe(false);
  });

  it('medios del recaudo = CHECK shipments_cod_collected_method_check', () => {
    expect(['cash', 'card', 'transfer', 'qr'].every(esMedioCobroContraentrega)).toBe(true);
    expect(esMedioCobroContraentrega('wompi')).toBe(false);
  });
});

describe('cotización: dirección', () => {
  it('normaliza el barrio igual que fn_logistica_normalizar', () => {
    expect(normalizarBarrio('  Santa   Mónica ')).toBe('santa monica');
    expect(normalizarBarrio('ÑUÑOA')).toBe('nunoa');
    expect(normalizarBarrio('   ')).toBeNull();
  });

  it('DANE de 5 dígitos, completa el de 4', () => {
    expect(normalizarCodigoDane('05001')).toBe('05001');
    expect(normalizarCodigoDane('5001')).toBe('05001');
    expect(normalizarCodigoDane(11001)).toBe('11001');
    expect(normalizarCodigoDane('05-001')).toBe('05001');
    expect(normalizarCodigoDane('123')).toBeNull();
    expect(normalizarCodigoDane(null)).toBeNull();
  });

  it('solo manda lo que la base usa y descarta coordenadas inválidas', () => {
    expect(direccionParaCotizar({ municipio_dane: '5001', barrio: ' Laureles ', codigo_postal: '050 031', lat: 6.24, lng: -75.59 }))
      .toEqual({ municipio_dane: '05001', barrio: 'Laureles', codigo_postal: '050031', lat: 6.24, lng: -75.59 });
    expect(direccionParaCotizar({ lat: 200, lng: -75 })).toEqual({});
    expect(direccionParaCotizar({ lat: 6.2 })).toEqual({});
    expect(direccionUbicable({})).toBe(false);
    expect(direccionUbicable({ barrio: 'Centro' })).toBe(true);
  });
});

describe('cotización: respuesta', () => {
  const base = {
    en_zona: true, zona: { id: 'z', nombre: 'Centro', es_tarifa_general: false, coincidencia: 'neighborhood' },
    precio: '5000.00', tarifa: '5000.00', moneda: 'COP', envio_gratis: false, envio_gratis_desde: '100000.00',
    falta_para_envio_gratis: '50000', pedido_minimo: '20000.00', cumple_minimo: true, falta_para_minimo: 0,
    tiempo: { min_minutos: 30, max_minutos: 60, texto: null }, despacho: null, modo: 'own', regla_id: null,
    motivo: null, alternativa: null, canal: 'web', subtotal: 50000,
  };

  it('convierte numeric a number', () => {
    const c = leerCotizacion(base);
    expect(c.precio).toBe(5000);
    expect(c.envio_gratis_desde).toBe(100000);
    expect(c.falta_para_envio_gratis).toBe(50000);
    expect(c.pedido_minimo).toBe(20000);
    expect(cotizacionPermiteDomicilio(c)).toBe(true);
  });

  it('fuera de cobertura o bajo el mínimo no permite domicilio propio', () => {
    expect(cotizacionPermiteDomicilio(leerCotizacion({ ...base, precio: null, en_zona: false, motivo: 'fuera_de_zona' }))).toBe(false);
    expect(cotizacionPermiteDomicilio(leerCotizacion({ ...base, cumple_minimo: false }))).toBe(false);
  });
});
