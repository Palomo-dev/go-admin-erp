/**
 * Pedido que arma el chat de atención (botón «Completar pedido»).
 *
 * Caso real del 2026-11-24 (org 358, una tienda de menaje): el chat resumió 3
 * productos por $ 74.100 + envío $ 20.000 = $ 94.100 con «Pago contra entrega»,
 * y el botón llevó 4 productos y ningún medio de pago: el checkout mostró
 * $ 106.100 con Bold elegido.
 */
import {
  armarCarritoDelResumen,
  codigoMetodoValido,
  metodoPagoDelChat,
  subtotalDelCarrito,
  subtotalDelResumen,
  type MetodoPagoWeb,
  type ProductoMostrado,
} from '../../../supabase/functions/_shared/ai-chat/pedidoDelChat';

const OLLAS: ProductoMostrado[] = [
  { id: 183301, name: 'Juego de Ollas 5 piezas', price: 9600, comparePrice: 160000, imageUrl: 'https://img/1.jpg', stock: 4 },
  { id: 183377, name: 'Juego De Ollas Turim 04 piezas', price: 9900, comparePrice: 161200, imageUrl: 'https://img/2.jpg', stock: 2 },
  { id: 183378, name: 'Juego de Ollas 7 Piezas Acero Inoxidable Línea Maestro', price: 54600, comparePrice: 635626, imageUrl: 'https://img/3.jpg', stock: 1 },
  { id: 183379, name: 'Juego de Ollas 7 piezas', price: 12000, comparePrice: 200800, imageUrl: 'https://img/4.jpg', stock: 6 },
];

const CONFIRMACION = `¡Pedido confirmado!

- Juego de Ollas 5 piezas: **$9.600**
- Juego De Ollas Turim 04 piezas: **$9.900**
- Juego de Ollas 7 Piezas Acero Inoxidable Línea Maestro: **$54.600**
- Subtotal: **$74.100**
- Envío: **$20.000**
- **Total: $94.100**
- Pago: **Pago contra entrega**
- Entrega: Medellín, Calle 10 #34-20`;

/** Medios de la tienda de ese caso, con el nombre que ve el cliente. */
const METODOS_TIENDA: MetodoPagoWeb[] = [
  { code: 'bold_link', name: 'Bold' },
  { code: 'cash', name: 'Pago contra entrega' },
  { code: 'mp', name: 'Mercado Pago' },
];

describe('armarCarritoDelResumen', () => {
  it('caso real: un nombre que es el comienzo de otro no se cuela al carrito', () => {
    const carrito = armarCarritoDelResumen(CONFIRMACION, OLLAS);
    expect(carrito.map((i) => i.productId)).toEqual([183301, 183377, 183378]);
    expect(carrito.every((i) => i.quantity === 1)).toBe(true);
    // Lo que viaja al checkout suma lo mismo que el resumen que el cliente aceptó.
    expect(subtotalDelCarrito(carrito)).toBe(74100);
    expect(subtotalDelResumen(CONFIRMACION)).toBe(74100);
  });

  it('el producto corto sí entra cuando el cliente lo pidió en su propia línea', () => {
    const texto = '- Juego de Ollas 7 piezas: $12.000\n- Juego de Ollas 7 Piezas Acero Inoxidable Línea Maestro: $54.600\n- Subtotal: $66.600';
    const carrito = armarCarritoDelResumen(texto, OLLAS);
    expect(carrito.map((i) => i.productId)).toEqual([183379, 183378]);
  });

  it('lee la cantidad escrita o la deduce del importe de la línea', () => {
    const texto = [
      '- 2 x Juego de Ollas 5 piezas: $19.200',
      '- Juego De Ollas Turim 04 piezas (x3): $29.700',
      '- Juego de Ollas 7 piezas: $36.000',
    ].join('\n');
    const carrito = armarCarritoDelResumen(texto, OLLAS);
    expect(carrito.map((i) => [i.productId, i.quantity])).toEqual([[183301, 2], [183377, 3], [183379, 3]]);
  });

  it('no cuenta totales, envío ni productos agotados o marcados no disponibles', () => {
    const productos = [...OLLAS.slice(0, 2).map((p) => ({ ...p })), { ...OLLAS[3], stock: 0 }];
    const texto = '- Juego de Ollas 5 piezas: $9.600\n- Juego De Ollas Turim 04 piezas (no disponible)\n- Juego de Ollas 7 piezas: $12.000\n- Envío: $20.000';
    expect(armarCarritoDelResumen(texto, productos).map((i) => i.productId)).toEqual([183301]);
  });

  it('un producto repetido en resumen y confirmación cuenta una vez', () => {
    const texto = 'Resumen:\n- Juego de Ollas 5 piezas: $9.600\nTe confirmo: Juego de Ollas 5 piezas por $9.600';
    expect(armarCarritoDelResumen(texto, OLLAS)).toHaveLength(1);
  });

  it('nombre con las palabras en otro orden: gana el producto que explica toda la línea', () => {
    const texto = '- Juego de Ollas Línea Maestro, 7 Piezas en Acero Inoxidable: $54.600';
    expect(armarCarritoDelResumen(texto, OLLAS).map((i) => i.productId)).toEqual([183378]);
  });

  it('sin ningún nombre, el respaldo por precio de siempre', () => {
    const carrito = armarCarritoDelResumen('Tu pedido de $54.600 quedó listo', OLLAS);
    expect(carrito.map((i) => i.productId)).toEqual([183378]);
  });
});

describe('metodoPagoDelChat', () => {
  it('caso real: «Pago: Pago contra entrega» → cash', () => {
    expect(metodoPagoDelChat(CONFIRMACION, [], METODOS_TIENDA)).toBe('cash');
  });

  it.each([
    'contraentrega',
    'Contra entrega por favor',
    'pago contra-entrega',
    'en efectivo',
    'EFECTIVO',
    'pago al recibir',
  ])('el cliente dice «%s» → cash', (dicho) => {
    // Tienda con el nombre de catálogo («Efectivo»): los sinónimos igual llegan a cash.
    const metodos: MetodoPagoWeb[] = [
      { code: 'bold_link', name: 'Bold (Link)' },
      { code: 'cash', name: 'Efectivo' },
      { code: 'transfer', name: 'Transferencia bancaria' },
    ];
    const respuesta = '¡Listo! Tu pedido quedó confirmado.';
    expect(metodoPagoDelChat(respuesta, [{ autor: 'cliente', texto: dicho }], metodos)).toBe('cash');
  });

  it('pasarelas por su nombre: Bold, Mercado Pago, Wompi, transferencia', () => {
    const metodos: MetodoPagoWeb[] = [...METODOS_TIENDA, { code: 'wompi_co', name: 'Wompi Colombia' }, { code: 'transfer', name: 'Transferencia bancaria' }];
    expect(metodoPagoDelChat('Pago: Bold', [], metodos)).toBe('bold_link');
    expect(metodoPagoDelChat('- Método de pago: **Mercado Pago**', [], metodos)).toBe('mp');
    expect(metodoPagoDelChat('ok', [{ autor: 'cliente', texto: 'con wompi' }], metodos)).toBe('wompi_co');
    expect(metodoPagoDelChat('ok', [{ autor: 'cliente', texto: 'por transferencia' }], metodos)).toBe('transfer');
  });

  it('nunca inventa: un medio que la tienda no tiene no produce código', () => {
    const soloPasarelas: MetodoPagoWeb[] = [{ code: 'bold_link', name: 'Bold' }];
    expect(metodoPagoDelChat('Pago: contra entrega', [{ autor: 'cliente', texto: 'efectivo' }], soloPasarelas)).toBeNull();
    expect(metodoPagoDelChat('Pago: contra entrega', [], [])).toBeNull();
  });

  it('ambiguo no decide: la pregunta de la IA lista todos y el cliente duda entre dos', () => {
    const pregunta = '¿Cómo quieres pagar? Bold, Pago contra entrega o Mercado Pago';
    expect(metodoPagoDelChat('Confirmado.', [{ autor: 'ia', texto: pregunta }], METODOS_TIENDA)).toBeNull();
    expect(metodoPagoDelChat('Confirmado.', [{ autor: 'cliente', texto: 'bold o contraentrega' }], METODOS_TIENDA)).toBeNull();
  });

  it('gana lo más reciente: la respuesta que cierra y luego los mensajes de nuevo a viejo', () => {
    const anteriores = [
      { autor: 'cliente' as const, texto: 'mejor contraentrega' },
      { autor: 'ia' as const, texto: '¿Cómo quieres pagar? Bold, Pago contra entrega o Mercado Pago' },
      { autor: 'cliente' as const, texto: 'con bold' },
    ];
    expect(metodoPagoDelChat('Listo, confirmado.', anteriores, METODOS_TIENDA)).toBe('cash');
  });

  it('el código que sale siempre es apto para la URL', () => {
    expect(codigoMetodoValido('cash')).toBe(true);
    expect(codigoMetodoValido('bold_link')).toBe(true);
    expect(codigoMetodoValido('Cash')).toBe(false);
    expect(codigoMetodoValido('cash&x=1')).toBe(false);
    expect(metodoPagoDelChat('Pago: Raro', [], [{ code: 'Raro Pago', name: 'Raro' }])).toBeNull();
  });
});
