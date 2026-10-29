import {
  cotizarCambio,
  envioRecalculado,
  sentidoDelta,
  bloqueoPorEstado,
  modoReembolso,
  pagoOriginalManual,
  CotizacionError,
  type OrdenCotizable,
} from '../cotizarCambio';
import { textoWhatsappCambio, urlWhatsappCambio, correoCambio } from '../plantillaCambio';

// Pedido IVA incluido: 2 × 10.000 (19 %), envío 5.000. Total 25.000.
const incluido: OrdenCotizable = {
  subtotal: 20000, tax_total: 3193.28, discount_total: 0, delivery_fee: 5000, tip_amount: 0, total: 25000,
  delivery_type: 'delivery_own', items: [{ product_id: 1, quantity: 2, unit_price: 10000 }],
};
// Pedido IVA sobre la base: 2 × 10.000 + 19 % + envío 5.000 = 28.800.
const sobreBase: OrdenCotizable = { ...incluido, tax_total: 3800, total: 28800 };

const linea = (product_id: number, quantity: number, precio: number, tasa = 19) => ({ product_id, quantity, precio, tasa, nombre: `P${product_id}` });

describe('cotizarCambio · delta', () => {
  it('lo que ya estaba conserva el precio pagado; lo adicional va a precio vigente', () => {
    const c = cotizarCambio(incluido, [linea(1, 3, 12000)]);
    // 2 × 10.000 (pagado) + 1 × 12.000 (vigente)
    expect(c.totales.subtotal).toBe(32000);
    expect(c.delta.total).toBe(12000);
    expect(sentidoDelta(c.delta.total)).toBe('cobrar');
  });

  it('quitar una unidad devuelve su precio pagado', () => {
    const c = cotizarCambio(incluido, [linea(1, 1, 99999)]);
    expect(c.totales.subtotal).toBe(10000);
    expect(c.delta.total).toBe(-10000);
    expect(sentidoDelta(c.delta.total)).toBe('devolver');
  });

  it('agregar un producto nuevo', () => {
    const c = cotizarCambio(incluido, [linea(1, 2, 10000), linea(2, 1, 7000, 0)]);
    expect(c.delta.total).toBe(7000);
    expect(c.items).toHaveLength(2);
  });

  it('mismo carrito ⇒ sin diferencia', () => {
    const c = cotizarCambio(incluido, [linea(1, 2, 15000)]);
    expect(sentidoDelta(c.delta.total)).toBe('igual');
  });

  it('agrupa líneas repetidas del mismo producto', () => {
    const c = cotizarCambio(incluido, [linea(1, 1, 10000), linea(1, 2, 10000)]);
    expect(c.items).toHaveLength(1);
    expect(c.items[0].quantity).toBe(3);
  });

  it('rechaza carrito vacío, cantidades no positivas y precios negativos', () => {
    expect(() => cotizarCambio(incluido, [])).toThrow(CotizacionError);
    expect(() => cotizarCambio(incluido, [linea(1, 0, 10)])).toThrow('Producto 1');
    expect(() => cotizarCambio(incluido, [linea(1, 1, -5)])).toThrow(CotizacionError);
  });
});

describe('cotizarCambio · IVA y envío', () => {
  it('IVA incluido: el impuesto se desglosa y no suma al total', () => {
    const c = cotizarCambio(incluido, [linea(1, 3, 10000)]);
    expect(c.impuestoSobreBase).toBe(false);
    expect(c.totales.tax_total).toBeCloseTo(30000 - 30000 / 1.19, 2);
    expect(c.totales.total).toBe(35000);
  });

  it('IVA sobre la base: el impuesto suma al total', () => {
    const c = cotizarCambio(sobreBase, [linea(1, 3, 10000)]);
    expect(c.impuestoSobreBase).toBe(true);
    expect(c.totales.tax_total).toBe(5700);
    expect(c.totales.total).toBe(30000 + 5700 + 5000);
    expect(c.delta.total).toBe(40700 - 28800);
  });

  it('envío: 0 en recoger y comer aquí; override o el original', () => {
    expect(envioRecalculado({ ...incluido, delivery_type: 'pickup' })).toBe(0);
    expect(envioRecalculado({ ...incluido, delivery_type: 'dine_in' })).toBe(0);
    expect(envioRecalculado(incluido, 8000)).toBe(8000);
    expect(envioRecalculado(incluido, null)).toBe(5000);
    expect(envioRecalculado(incluido, -1)).toBe(5000);
    const c = cotizarCambio(incluido, [linea(1, 2, 10000)], { nuevo: 8000 });
    expect(c.delta.shipping).toBe(3000);
    expect(c.delta.total).toBe(3000);
  });

  it('cupón de pedido: al quitar la mitad de la base, se devuelve la mitad del cupón (no se queda entero)', () => {
    // 2 × 10.000 con cupón de 4.000 (sin descuento por línea). Total 16.000 + 5.000 envío = 21.000.
    const conCupon = { ...incluido, discount_total: 4000, total: 21000 };
    const c = cotizarCambio(conCupon, [linea(1, 1, 10000)]);
    expect(c.totales.discount_total).toBe(2000);
    expect(c.items[0].discount_amount).toBe(2000);
    expect(c.totales.total).toBe(10000 - 2000 + 5000);
    expect(c.delta.total).toBe(-8000); // devuelve lo que pagó por esa unidad (10.000 − 2.000)
  });

  it('cupón: agregar productos no hace crecer el cupón', () => {
    const conCupon = { ...incluido, discount_total: 4000, total: 21000 };
    const c = cotizarCambio(conCupon, [linea(1, 2, 10000), linea(2, 1, 6000, 0)]);
    expect(c.totales.discount_total).toBe(4000);
    expect(c.delta.total).toBe(6000);
    // Prorrateo en centavos sobre ambas líneas, suma exacta.
    expect(c.items.reduce((s, i) => s + i.discount_amount, 0)).toBe(4000);
  });

  it('promo por línea: quitar el producto en promo devuelve su precio neto, no el bruto', () => {
    // P1 2 × 10.000 con 3.000 de promo en la línea; P2 1 × 5.000 sin promo.
    const o: OrdenCotizable = {
      subtotal: 25000, tax_total: 0, discount_total: 3000, delivery_fee: 0, tip_amount: 0, total: 22000, delivery_type: 'pickup',
      items: [{ product_id: 1, quantity: 2, unit_price: 10000, discount_amount: 3000 }, { product_id: 2, quantity: 1, unit_price: 5000, discount_amount: 0 }],
    };
    const c = cotizarCambio(o, [linea(1, 1, 10000, 0), linea(2, 1, 5000, 0)]);
    expect(c.items.find((i) => i.product_id === 1)?.discount_amount).toBe(1500);
    expect(c.items.find((i) => i.product_id === 2)?.discount_amount).toBe(0);
    expect(c.totales.discount_total).toBe(1500);
    expect(c.delta.total).toBe(-8500);
    // Quitar del todo el producto en promo.
    const sinP1 = cotizarCambio(o, [linea(2, 1, 5000, 0)]);
    expect(sinP1.totales.discount_total).toBe(0);
    expect(sinP1.delta.total).toBe(-17000);
  });

  it('promo_excluded: el cupón no se reparte en esa línea ni se escala por ella', () => {
    // P1 excluida (10.000), P2 elegible (10.000) con cupón de 2.000. Total 18.000.
    const o: OrdenCotizable = {
      subtotal: 20000, tax_total: 0, discount_total: 2000, delivery_fee: 0, tip_amount: 0, total: 18000, delivery_type: 'pickup',
      items: [{ product_id: 1, quantity: 1, unit_price: 10000, promo_excluded: true }, { product_id: 2, quantity: 1, unit_price: 10000 }],
    };
    const quitarExcluida = cotizarCambio(o, [linea(2, 1, 10000, 0)]);
    expect(quitarExcluida.totales.discount_total).toBe(2000);
    expect(quitarExcluida.delta.total).toBe(-10000);
    const mismo = cotizarCambio(o, [linea(1, 1, 10000, 0), linea(2, 1, 10000, 0)]);
    expect(mismo.items.find((i) => i.product_id === 1)).toMatchObject({ discount_amount: 0, promo_excluded: true });
    expect(mismo.delta.total).toBe(0);
  });

  it('conserva la propina', () => {
    const c = cotizarCambio({ ...incluido, tip_amount: 2000, total: 27000 }, [linea(1, 2, 10000)]);
    expect(c.totales.tip_amount).toBe(2000);
    expect(c.delta.total).toBe(0);
  });
});

describe('bloqueos y modo de reembolso', () => {
  const base = { status: 'confirmed', payment_status: 'paid', table_session_id: null };
  it.each([
    [{ ...base, payment_status: 'pending' }, 'PEDIDO_NO_PAGADO'],
    [{ ...base, status: 'in_delivery' }, 'PEDIDO_DESPACHADO'],
    [{ ...base, status: 'delivered' }, 'PEDIDO_DESPACHADO'],
    [{ ...base, status: 'cancelled' }, 'PEDIDO_CERRADO'],
    [{ ...base, table_session_id: 'x' }, 'PEDIDO_DE_MESA'],
    [base, null],
    [{ ...base, status: 'preparing' }, null],
  ])('%o ⇒ %s', (o, esperado) => expect(bloqueoPorEstado(o)).toBe(esperado));

  it('reembolso: manual por defecto (sin API de parcial en Wompi/Bold)', () => {
    expect(modoReembolso({ payment_method: 'wompi' })).toBe('manual');
    expect(modoReembolso({ payment_method: 'mercadopago' }, 'refund')).toBe('manual');
  });
  it('saldo a favor exige cliente', () => {
    expect(modoReembolso({ customer_id: 'c1' }, 'customer_credit')).toBe('customer_credit');
    expect(() => modoReembolso({ customer_id: null }, 'customer_credit')).toThrow('SALDO_SIN_CLIENTE');
  });
  it('detecta pago original MANUAL', () => {
    expect(pagoOriginalManual({ payment_reference: 'MANUAL-123' })).toBe(true);
    expect(pagoOriginalManual({ payment_reference: '1578504-abc' })).toBe(false);
  });
});

describe('plantillas del link', () => {
  const d = { negocio: 'Café Luna', numeroPedido: 'WO-1', nombreCliente: 'Ana', montoTexto: '$ 12.000', url: 'https://checkout.wompi.co/l/abc', vence: 'mañana' };
  it('WhatsApp: texto con monto y link; antepone 57 a celulares de 10 dígitos', () => {
    expect(textoWhatsappCambio(d)).toContain('$ 12.000');
    const u = urlWhatsappCambio('300 123 4567', d);
    expect(u.startsWith('https://wa.me/573001234567?text=')).toBe(true);
    expect(decodeURIComponent(u)).toContain(d.url);
    expect(urlWhatsappCambio('+57 3001234567', d)).toContain('wa.me/573001234567');
  });
  it('correo con la marca y escapado', () => {
    const c = correoCambio({ ...d, negocio: 'A<b>', colorMarca: '#ff0000' });
    expect(c.asunto).toContain('WO-1');
    expect(c.html).toContain('A&lt;b&gt;');
    expect(c.html).toContain('#ff0000');
    expect(correoCambio({ ...d, colorMarca: 'red;x' }).html).not.toContain('red;x');
    expect(c.text).toContain(d.url);
  });
});
