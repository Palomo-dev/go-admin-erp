import {
  anticipoPagadoVencido,
  anticiposPagadosVencidos,
  asuntoAvisoAnticipo,
  codigoErrorDevolucion,
  estadoLineaStock,
  minutosTarde,
  reactivadoPorAnticipoTardio,
  resumenStockAnticipo,
  textoAvisoAnticipo,
} from '../anticipoVencido';

/** Pedido de la org 358 de anoche (anonimizado): vencido, anticipo de $ 20.000 pagado 19 min tarde. */
const vencido = { status: 'expired', advance_status: 'paid', payment_status: 'partial', advance_amount: '20000.00', sale_id: null };

describe('anticipoPagadoVencido (estado deducido, sin columna nueva)', () => {
  it('vencido + anticipo pagado + sin devolver ni venta', () => {
    expect(anticipoPagadoVencido(vencido)).toBe(true);
  });
  it('no: devuelto, reactivado, con venta, sin anticipo o anticipo sin pagar', () => {
    expect(anticipoPagadoVencido({ ...vencido, payment_status: 'refunded' })).toBe(false);
    expect(anticipoPagadoVencido({ ...vencido, status: 'pending' })).toBe(false);
    expect(anticipoPagadoVencido({ ...vencido, status: 'cancelled' })).toBe(false);
    expect(anticipoPagadoVencido({ ...vencido, sale_id: 'x' })).toBe(false);
    expect(anticipoPagadoVencido({ ...vencido, advance_amount: null })).toBe(false);
    expect(anticipoPagadoVencido({ ...vencido, advance_status: 'expired' })).toBe(false);
  });
  it('filtra una lista', () => {
    expect(anticiposPagadosVencidos([vencido, { ...vencido, status: 'confirmed' }])).toHaveLength(1);
  });
});

describe('stock por línea', () => {
  it('disponible, parcial y sin stock', () => {
    expect(estadoLineaStock({ product_id: 1, product_name: 'A', quantity: 2, disponible: 14 })).toBe('disponible');
    expect(estadoLineaStock({ product_id: 1, product_name: 'A', quantity: 2, disponible: '1.000' })).toBe('parcial');
    expect(estadoLineaStock({ product_id: 1, product_name: 'A', quantity: '2.00', disponible: 0 })).toBe('sin_stock');
    expect(estadoLineaStock({ product_id: 1, product_name: 'A', quantity: 1, disponible: -3 })).toBe('sin_stock');
  });
  it('se reactiva solo con stock de TODAS las líneas', () => {
    expect(resumenStockAnticipo([{ product_id: 1, product_name: 'A', quantity: 1, disponible: 200 }])).toEqual({ faltan: 0, todoDisponible: true });
    expect(resumenStockAnticipo([
      { product_id: 1, product_name: 'A', quantity: 2, disponible: 0 },
      { product_id: 2, product_name: 'B', quantity: 2, disponible: 1 },
      { product_id: 3, product_name: 'C', quantity: 1, disponible: 5 },
    ])).toEqual({ faltan: 2, todoDisponible: false });
    expect(resumenStockAnticipo([]).todoDisponible).toBe(false);
  });
});

describe('minutosTarde', () => {
  it('redondea hacia arriba y nunca es negativo', () => {
    expect(minutosTarde('2026-11-25T02:43:59Z', '2026-11-25T03:02:26Z')).toBe(19);
    expect(minutosTarde('2026-11-25T03:00:00Z', '2026-11-25T02:00:00Z')).toBe(0);
    expect(minutosTarde(null, '2026-11-25T03:02:26Z')).toBeNull();
  });
});

describe('avisos al cliente (WhatsApp y texto del correo)', () => {
  const d = { cliente: 'Laura Pérez', numero: 'WO-1', negocio: 'Una tienda de electrodomésticos', anticipo: '$ 20.000', alRecibir: '$ 422.600' };
  it('reactivado: sigue en pie y lo que paga al recibir', () => {
    const t = textoAvisoAnticipo('anticipo_reactivado', d);
    expect(t).toContain('Hola Laura,');
    expect(t).toContain('sigue en pie');
    expect(t).toContain('$ 422.600');
    expect(asuntoAvisoAnticipo('anticipo_reactivado', 'WO-1')).toBe('Tu pedido WO-1 sigue en pie');
  });
  it('revisando: promete devolver completo', () => {
    expect(textoAvisoAnticipo('anticipo_revisando', d)).toContain('te lo devolvemos completo');
  });
  it('devuelto: monto y medio', () => {
    expect(textoAvisoAnticipo('anticipo_devuelto', { ...d, medio: 'reverso en Bold' })).toContain('Te devolvimos $ 20.000 por reverso en Bold');
  });
  it('sin la marca de la plataforma', () => {
    for (const m of ['anticipo_reactivado', 'anticipo_revisando', 'anticipo_devuelto'] as const) {
      expect(textoAvisoAnticipo(m, d)).not.toMatch(/go ?admin/i);
    }
  });
});

describe('códigos y notas de la base', () => {
  it('traduce el RAISE de fn_web_order_anticipo_devolver', () => {
    expect(codigoErrorDevolucion('ANTICIPO_SIN_2805')).toBe('ANTICIPO_SIN_2805');
    expect(codigoErrorDevolucion('algo raro')).toBe('desconocido');
  });
  it('reconoce la nota de fn_web_order_anticipo_tardio', () => {
    expect(reactivadoPorAnticipoTardio('x\n[REACTIVADO POR ANTICIPO TARDÍO 2026-11-25 00:51] $ 20.000')).toBe(true);
    expect(reactivadoPorAnticipoTardio('[REACTIVADO 2026-11-25] cancelado por pago fallido')).toBe(false);
  });
});
