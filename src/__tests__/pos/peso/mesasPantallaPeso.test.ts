/**
 * Productos por peso fuera del mostrador (PRODUCTOS-POR-PESO-BASCULA.md §10):
 * mesas (carrito, traslado, cuenta dividida), comandas «500 g», pantalla
 * del cliente («Pesando…» y el NaN de «1,5»), «Lleve X pague Y» y las
 * cantidades de Stock, Movimientos, Kardex y Lotes.
 *
 * Datos inventados: organización 120, sucursal 7.
 */

const productosConsultados: number[][] = [];
jest.mock('@/lib/supabase/config', () => {
  const promociones = { rows: [] as unknown[] };
  const modos: Record<number, string> = {};
  (globalThis as unknown as { __promo: typeof promociones; __modos: typeof modos }).__promo = promociones;
  (globalThis as unknown as { __modos: typeof modos }).__modos = modos;
  const cadena = (tabla: string) => {
    const estado: { ids?: number[] } = {};
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'lte', 'order', 'is', 'limit']) c[m] = () => c;
    c.in = (_col: string, ids: number[]) => {
      estado.ids = ids;
      return c;
    };
    c.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
      if (tabla === 'promotions') return Promise.resolve({ data: promociones.rows, error: null }).then(ok, ko);
      if (tabla === 'products') {
        productosConsultados.push(estado.ids ?? []);
        return Promise.resolve({
          data: (estado.ids ?? []).map((id) => ({ id, sale_mode: modos[id] ?? 'unit', qty_decimals: modos[id] === 'weight' ? 3 : 0, unit_code: modos[id] === 'weight' ? 'KG  ' : 'UN  ' })),
          error: null,
        }).then(ok, ko);
      }
      return Promise.resolve({ data: [], error: null }).then(ok, ko);
    };
    return c;
  };
  return { supabase: { from: cadena } };
});

import {
  agregarLinea,
  asignacionParte,
  clavePesada,
  claveUnidad,
  formatoCantidadCarrito,
  formatoCantidadLinea,
  leerCantidadLinea,
  productoEnCarrito,
  restarCantidad,
  resumenProductoEnCarrito,
  sumarCantidades,
  validarTraslado,
  type CarritoMesa,
} from '@/components/pos/mesas/id/cantidadMesa';
import type { ProductToAdd, SaleItem } from '@/components/pos/mesas/id/types';
import { itemsParaImprimir, ticketRondaDesdeRegistro, type RegistroComanda } from '@/lib/pos/cocina/lineasCarrito';
import { buildKitchenTicketsHTML, getPaperSpec } from '@printing';
import { toAmount, projectCartForDisplay } from '@/lib/pos/display/projection';
import { DisplayEmitter } from '@/lib/pos/display/emitter';
import { buildDisplayWeighing, formatWeighingMoney, formatWeighingQty, sameWeighing, sanitizeDisplayWeighing } from '@/lib/pos/display/weighing';
import { sanitizeDisplayState } from '@/components/pos-display/logic';
import { contextoDesdeRespuesta } from '@/lib/pos/peso/usePesajeContexto';
import { promotionEngine } from '@/lib/services/promotionEngine';
import { idsProductos, productoMedido, textoCantidadProducto } from '@/components/inventario/stock/cantidadProducto';
import { aReporte, claseError, totalesPesosManuales } from '@/components/pos/reportes/pesosManualesService';
import type { Cart, Product } from '@/components/pos/types';
import { pareceCodigoDeBarras, resolverEscaneo, type DependenciasEscaneo } from '@/lib/pos/venta/escaneo';
import { FORMATO_ETIQUETA_RECOMENDADO, construirEtiquetaPeso } from '@/lib/pos/etiquetaPeso';
import type { PosGridProduct } from '@/lib/pos/venta/catalogo';
import type { DisplayState } from '@/lib/pos/display/protocol';

const QUESO = { sale_mode: 'weight', qty_decimals: 3, unit_code: 'KG  ' };

function linea(parcial: Partial<ProductToAdd>): ProductToAdd {
  return { product_id: 1, product_name: 'Queso', quantity: 1, unit_price: 18900, notes: '', ...parcial };
}

describe('mesas: carrito de «Agregar productos»', () => {
  it('una línea por unidad se funde con otra igual; cada pesada es su propia línea', () => {
    let c: CarritoMesa = new Map();
    c = agregarLinea(c, linea({ product_id: 5, product_name: 'Gaseosa', unit_price: 3000 }), claveUnidad(5));
    c = agregarLinea(c, linea({ product_id: 5, product_name: 'Gaseosa', unit_price: 3000 }), claveUnidad(5));
    c = agregarLinea(c, linea({ ...QUESO, quantity: 0.735 }), clavePesada(1, 1));
    c = agregarLinea(c, linea({ ...QUESO, quantity: 0.5 }), clavePesada(1, 2));
    expect(c.size).toBe(3);
    expect(c.get(claveUnidad(5))?.quantity).toBe(2);
    expect(productoEnCarrito(c, 1)).toBe(true);
    expect(resumenProductoEnCarrito(c, 1)).toBe('1,235 kg');
    expect(resumenProductoEnCarrito(c, 5)).toBe('2');
    expect(resumenProductoEnCarrito(c, 99)).toBeNull();
    expect(formatoCantidadCarrito(c.get(clavePesada(1, 2))!)).toBe('500 g');
  });

  it('agregar no muta el carrito anterior', () => {
    const c: CarritoMesa = new Map();
    const d = agregarLinea(c, linea({ product_id: 5 }), claveUnidad(5));
    expect(c.size).toBe(0);
    expect(d.size).toBe(1);
  });
});

describe('mesas: cantidades con decimales (antes parseInt)', () => {
  const pesada = { product: { sale_mode: 'weight', qty_decimals: 3, unit_code: 'KG' } } as unknown as SaleItem;
  const plato = { product: { sale_mode: 'unit' } } as unknown as SaleItem;

  it('lee coma o punto con los decimales de la línea y no trunca en silencio', () => {
    expect(leerCantidadLinea('0,735', 3)).toBe(0.735);
    expect(leerCantidadLinea('1.5', 3)).toBe(1.5);
    expect(leerCantidadLinea('0,7354', 3)).toBeNull();
    expect(leerCantidadLinea('1,5', 0)).toBeNull();
    expect(leerCantidadLinea('2', 0)).toBe(2);
    expect(leerCantidadLinea('0', 3)).toBeNull();
  });

  it('muestra «500 g» en la línea por peso y «3» en la de platos', () => {
    expect(formatoCantidadLinea(0.5, pesada)).toBe('500 g');
    expect(formatoCantidadLinea(3, plato)).toBe('3');
    expect(formatoCantidadLinea('0.735', pesada, 'en-US')).toBe('735 g');
  });

  it('traslado: mayor que 0, con los decimales de la línea y no más de lo que hay', () => {
    expect(validarTraslado(0.25, 0.735, 3)).toBeNull();
    expect(validarTraslado(0.8, 0.735, 3)).toBe('excede');
    expect(validarTraslado(null, 0.735, 3)).toBe('invalida');
    expect(validarTraslado(0.2505, 0.735, 3)).toBe('invalida');
    expect(validarTraslado(1.5, 3, 0)).toBe('invalida');
    expect(restarCantidad(0.735, 0.5, 3)).toBe(0.235);
  });

  it('cuenta dividida: la parte se topa en lo que queda y suma sin errores de coma flotante', () => {
    expect(asignacionParte(0.5, 0.735, 3)).toBe(0.5);
    expect(asignacionParte(1, 0.235, 3)).toBe(0.235);
    expect(asignacionParte(-1, 0.235, 3)).toBe(0);
    expect(sumarCantidades([0.1, 0.2], 3)).toBe(0.3);
    expect(sumarCantidades([0.5, 0.235], 3)).toBe(0.735);
  });
});

describe('comandas y cocina: «500 g Carne»', () => {
  const registro: RegistroComanda = {
    id: 9,
    created_at: '2026-09-29T17:00:00Z',
    kitchen_ticket_items: [
      { id: 1, product_name: 'Carne', quantity: 0.5, station: 'hot_kitchen', sale_items: { quantity: 0.5, products: { name: 'Carne', ...QUESO } } },
      { id: 2, product_name: 'Limonada', quantity: 2, station: 'bar', sale_items: { quantity: 2, products: { name: 'Limonada', sale_mode: 'unit' } } },
    ],
  };
  const textos = { mesa: '', ajuste: () => '', mas: () => '', menos: () => '', anular: '', notaCambiada: '', alergia: '' };

  it('la ronda y lo impreso llevan la unidad solo en la línea por peso', () => {
    const ronda = ticketRondaDesdeRegistro(registro);
    expect(ronda.items[0]).toMatchObject({ unit: 'kg', qtyDecimals: 3 });
    expect(ronda.items[1]).not.toHaveProperty('unit');
    const items = itemsParaImprimir(ronda, textos);
    expect(items[0]).toMatchObject({ productName: 'Carne', quantity: 0.5, unit: 'kg', qtyDecimals: 3 });
    expect(items[1]).not.toHaveProperty('unit');
  });

  it('la comanda impresa dice «500 g Carne» y «2x Limonada»', () => {
    const items = itemsParaImprimir(ticketRondaDesdeRegistro(registro), textos);
    const html = buildKitchenTicketsHTML(
      [{ ticketId: 9, station: 'all', createdAt: '2026-09-29T17:00:00Z', items: items.map((i) => ({ ...i, notes: i.notes })) }],
      getPaperSpec('80mm'),
    );
    expect(html).toContain('500 g Carne');
    expect(html).toContain('2x Limonada');
  });
});

describe('pantalla del cliente', () => {
  it('«1,5» ya no se proyecta como 0 (NaN)', () => {
    expect(toAmount('1,5')).toBe(1.5);
    expect(toAmount('0,735')).toBe(0.735);
    expect(toAmount('1.500,25')).toBe(0);
    expect(toAmount('')).toBe(0);
    expect(toAmount(2)).toBe(2);
    const cart = {
      id: 'c1',
      status: 'active',
      items: [{ id: 'l1', product_id: 1, quantity: '1,5' as unknown as number, unit_price: 1000, product: { name: 'Queso' } }],
    } as unknown as Cart;
    const proyectado = projectCartForDisplay(cart, { currency: 'COP' });
    expect(proyectado.lines[0].qty).toBe(1.5);
    expect(proyectado.subtotal).toBe(1500);
  });

  it('la pesada se arma con el importe exacto y se formatea con los decimales de la moneda', () => {
    const w = buildDisplayWeighing({ name: 'Queso', qty: 0.735, unit: 'kg', decimals: 3, unitPrice: 18900, moneyDecimals: 0 });
    expect(w).toEqual({ name: 'Queso', qty: 0.735, unit: 'kg', decimals: 3, unitPrice: 18900, total: 0.735 * 18900, moneyDecimals: 0 });
    expect(formatWeighingQty(w!, 'es-CO')).toBe('735 g');
    expect(formatWeighingMoney(w!.total, 'COP', 'es-CO', 0).replace(/\s/g, ' ')).toBe('$ 13.892');
    expect(buildDisplayWeighing({ name: '', qty: 1, unit: 'kg', decimals: 3, unitPrice: 1 })).toBeNull();
    expect(buildDisplayWeighing({ name: 'Queso', qty: 0, unit: 'kg', decimals: 3, unitPrice: 18900 })?.qty).toBeNull();
    expect(sanitizeDisplayWeighing({ name: 'Queso', qty: 'x', unit: 'kg', decimals: 9, unitPrice: 100 })).toMatchObject({ qty: null, decimals: 3 });
    expect(sanitizeDisplayWeighing('nada')).toBeNull();
    expect(sameWeighing(w, { ...w! })).toBe(true);
  });

  it('el emisor manda la pesada en Reposo y Pedido, nunca encima del cobro, y la retira', () => {
    const emisor = new DisplayEmitter({ createTransport: () => null, isEnabled: () => false });
    const w = buildDisplayWeighing({ name: 'Queso', qty: 0.735, unit: 'kg', decimals: 3, unitPrice: 18900, moneyDecimals: 0 })!;
    emisor.setWeighing(w); // sin arrancar: se ignora
    expect(emisor.getState()).not.toHaveProperty('weighing');
    emisor.start({ organizationId: 120, currency: 'COP' });
    expect(emisor.getState()).toEqual({ mode: 'idle', cart: null, payment: null, tip: null, thanks: null });
    emisor.setWeighing(w);
    expect(emisor.getState()).toMatchObject({ mode: 'idle', weighing: w });
    emisor.setActiveCart({
      id: 'c1',
      status: 'active',
      items: [{ id: 'l1', product_id: 2, quantity: 1, unit_price: 3000, product: { name: 'Pan' } }],
    } as unknown as Cart);
    expect(emisor.getState()).toMatchObject({ mode: 'order', weighing: w });
    emisor.setPayment({ method: 'cash', total: 3000, received: null, change: null });
    expect(emisor.getState().mode).toBe('payment');
    expect(emisor.getState()).not.toHaveProperty('weighing');
    emisor.setPayment(null);
    emisor.setWeighing(null);
    expect(emisor.getState()).not.toHaveProperty('weighing');
  });

  it('la pantalla sanea la pesada y deja igual los estados sin ella', () => {
    const base: DisplayState = { mode: 'idle', cart: null, payment: null, tip: null, thanks: null };
    expect(sanitizeDisplayState(base)).toEqual(base);
    const conPesada = sanitizeDisplayState({ ...base, weighing: { name: 'Queso', qty: 0.5, unit: 'kg', decimals: 3, unitPrice: 18900, total: 9450 } });
    expect(conPesada.weighing).toMatchObject({ name: 'Queso', qty: 0.5, total: 9450 });
    expect(sanitizeDisplayState({ ...base, weighing: { name: '' } as never })).not.toHaveProperty('weighing');
  });

  it('la regla «peso en pantalla del cliente» viene activa salvo false explícito', () => {
    expect(contextoDesdeRespuesta({ manual: 'permiso', puede_pesar_a_mano: true }).pesoEnPantallaCliente).toBe(true);
    expect(contextoDesdeRespuesta({ peso_en_pantalla_cliente: false }).pesoEnPantallaCliente).toBe(false);
    expect(contextoDesdeRespuesta(null).pesoEnPantallaCliente).toBe(true);
  });
});

describe('promociones: «Lleve X pague Y» no aplica a productos por peso', () => {
  const g = globalThis as unknown as { __promo: { rows: unknown[] }; __modos: Record<number, string> };
  const promo = (tipo: string, extra: Record<string, unknown> = {}) => ({
    id: `p-${tipo}`,
    name: tipo,
    promotion_type: tipo,
    applies_to: 'all',
    is_active: true,
    is_combinable: true,
    start_date: '2026-01-01T00:00:00Z',
    end_date: null,
    days_of_week: null,
    branches: [],
    promotion_rules: [],
    ...extra,
  });

  beforeEach(() => {
    productosConsultados.length = 0;
    for (const k of Object.keys(g.__modos)) delete g.__modos[Number(k)];
  });

  it('2 x 1 no regala kilos: 2,5 kg de queso no cuentan como «2»', async () => {
    g.__promo.rows = [promo('buy_x_get_y', { buy_quantity: 1, get_quantity: 1 })];
    const r = await promotionEngine.evaluate({
      channel: 'pos',
      organization_id: 120,
      items: [
        { product_id: 1, quantity: 2.5, unit_price: 18900, sale_mode: 'weight' },
        { product_id: 5, quantity: 2, unit_price: 3000, sale_mode: 'unit' },
      ],
    });
    expect(r.itemDiscounts[1]).toBeUndefined();
    expect(r.itemDiscounts[5]).toBe(3000);
    expect(r.lineDiscounts).toEqual([0, 3000]);
    expect(productosConsultados).toEqual([]);
  });

  it('sin sale_mode, el motor lo consulta (una lectura) antes de aplicar el 2 x 1', async () => {
    g.__promo.rows = [promo('buy_x_get_y', { buy_quantity: 1, get_quantity: 1 })];
    g.__modos[1] = 'weight';
    const r = await promotionEngine.evaluate({
      channel: 'pos',
      organization_id: 120,
      items: [{ product_id: 1, quantity: 2, unit_price: 18900 }],
    });
    expect(productosConsultados).toEqual([[1]]);
    expect(r.discountTotal).toBe(0);
  });

  it('el descuento por porcentaje sí aplica, y cada pesada lleva solo el suyo', async () => {
    g.__promo.rows = [promo('percentage', { discount_value: 10 })];
    const r = await promotionEngine.evaluate({
      channel: 'pos',
      organization_id: 120,
      items: [
        { product_id: 1, quantity: 0.735, unit_price: 18900, sale_mode: 'weight' },
        { product_id: 1, quantity: 0.5, unit_price: 18900, sale_mode: 'weight' },
      ],
    });
    expect(r.lineDiscounts).toEqual([1389.15, 945]);
    expect(r.itemDiscounts[1]).toBeCloseTo(2334.15, 2);
    expect(productosConsultados).toEqual([]);
  });

  it('el monto fijo se reparte por línea con su tope', async () => {
    g.__promo.rows = [promo('fixed_amount', { discount_value: 1000, max_discount_amount: 500 })];
    const r = await promotionEngine.evaluate({
      channel: 'pos',
      organization_id: 120,
      items: [
        { product_id: 1, quantity: 1, unit_price: 1000, sale_mode: 'weight' },
        { product_id: 1, quantity: 1, unit_price: 3000, sale_mode: 'weight' },
      ],
    });
    expect(r.discountTotal).toBe(500);
    expect(r.lineDiscounts).toEqual([125, 375]);
  });
});

describe('existencias: «12,400 kg» en vez de «uds»', () => {
  const modos = new Map([[1, QUESO]]);
  it('producto por peso con su unidad; por unidad, «N uds» como siempre', () => {
    expect(textoCantidadProducto(12.4, modos.get(1), 'es', (n) => `${n} uds`)).toBe('12,400 kg');
    expect(textoCantidadProducto(12, undefined, 'es', (n) => `${n} uds`)).toBe('12 uds');
    expect(textoCantidadProducto(0.735, undefined, 'es')).toBe('0,735');
    expect(textoCantidadProducto(12.4, modos.get(1), 'en')).toBe('12.400 kg');
    expect(productoMedido(modos, 1)).toBe(true);
    expect(productoMedido(modos, 2)).toBe(false);
    expect(idsProductos([{ product_id: 3 }, { product_id: 1 }, { product_id: 3 }, { product_id: null }])).toEqual([1, 3]);
  });
});

describe('reporte «Pesos manuales»', () => {
  it('normaliza la respuesta y suma por unidad', () => {
    const r = aReporte({
      zona: 'America/Bogota',
      desde: '2026-09-29',
      hasta: '2026-09-29',
      filas: [
        { dia: '2026-09-29', usuario_id: 'u1', cajero: 'Cajera A', unidad: 'KG', lineas: 2, cantidad: '1.235', importe: '23341.50', autorizadas: 1 },
        { dia: '2026-09-28', usuario_id: 'u2', cajero: null, unidad: 'LB', lineas: 1, cantidad: 2, importe: 5000, autorizadas: 0 },
        { dia: '2026-09-28', usuario_id: 'u1', cajero: 'Cajera A', unidad: 'KG', lineas: 1, cantidad: 0.1, importe: 1890, autorizadas: 0 },
      ],
    });
    expect(r.filas[0]).toEqual({ dia: '2026-09-29', usuario_id: 'u1', cajero: 'Cajera A', unidad: 'KG', lineas: 2, cantidad: 1.235, importe: 23341.5, autorizadas: 1 });
    expect(r.filas[1].cajero).toBeNull();
    expect(totalesPesosManuales(r.filas)).toEqual({
      lineas: 4,
      importe: 30231.5,
      cajeros: 2,
      porUnidad: [
        { unidad: 'KG', cantidad: 1.335 },
        { unidad: 'LB', cantidad: 2 },
      ],
    });
    expect(aReporte(null)).toEqual({ zona: '', desde: '', hasta: '', filas: [] });
  });

  it('distingue sin permiso, rango inválido y error', () => {
    expect(claseError({ code: '42501', message: 'sin_permiso_reporte_pesos' })).toBe('sinPermiso');
    expect(claseError({ message: 'Acceso denegado a la organización' })).toBe('sinPermiso');
    expect(claseError({ code: '22023', message: 'rango_invalido' })).toBe('rango');
    expect(claseError(new Error('fetch failed'))).toBe('error');
  });
});

describe('escaneo compartido POS / mesa (resolverEscaneo)', () => {
  const gaseosa = { id: 5, name: 'Gaseosa', sku: 'GAS', barcode: '7701234567890', parent_product_id: null, price: 3000 } as unknown as Product;
  const queso = { id: 31, name: 'Queso', sku: 'QUE', sale_mode: 'weight', qty_decimals: 3, unit_code: 'KG', price: 18900 } as unknown as Product;
  const deps = (over: Partial<DependenciasEscaneo> = {}): DependenciasEscaneo => ({
    porCodigo: async (c) => (c === '7701234567890' ? gaseosa : null),
    grilla: async (t) => (t === '7701234567890' ? [gaseosa as PosGridProduct] : t === 'QUE' ? [queso as PosGridProduct] : []),
    porPlu: async (plu) => (plu === 31 ? queso : null),
    precioVigente: async () => 18900,
    formatoEtiqueta: FORMATO_ETIQUETA_RECOMENDADO,
    decimalesMoneda: 0,
    ...over,
  });

  it('el código exacto manda: producto simple → como la tarjeta', async () => {
    const r = await resolverEscaneo('7701234567890', deps());
    expect(r).toEqual({ tipo: 'producto', decision: { tipo: 'tarjeta', producto: gaseosa } });
  });

  it('etiqueta de balanza (prefijo 27, PLU 31, 735 g) → línea con su peso y origen «etiqueta»', async () => {
    const codigo = construirEtiquetaPeso(FORMATO_ETIQUETA_RECOMENDADO, '27', 31, 735);
    const r = await resolverEscaneo(codigo, deps());
    expect(r.tipo).toBe('etiqueta');
    if (r.tipo !== 'etiqueta') return;
    expect(r.producto?.id).toBe(31);
    expect(r.linea).toMatchObject({ ok: true, cantidad: 0.735, pesaje: { origen: 'etiqueta', neto: 0.735, unidad: 'KG', codigo_etiqueta: codigo } });
  });

  it('sin lector de PLU (pantalla sin etiquetas) un código desconocido es «no encontrado»', async () => {
    const codigo = construirEtiquetaPeso(FORMATO_ETIQUETA_RECOMENDADO, '27', 31, 735);
    expect(await resolverEscaneo(codigo, deps({ porPlu: undefined }))).toEqual({ tipo: 'producto', decision: { tipo: 'no_encontrado' } });
  });

  it('etiqueta con dígito de control malo → inválida; PLU inexistente → error de línea', async () => {
    const codigo = construirEtiquetaPeso(FORMATO_ETIQUETA_RECOMENDADO, '27', 31, 735);
    const malo = codigo.slice(0, 12) + String((Number(codigo[12]) + 1) % 10);
    expect(await resolverEscaneo(malo, deps())).toEqual({ tipo: 'etiqueta_invalida', motivo: 'digito_control' });
    const otro = construirEtiquetaPeso(FORMATO_ETIQUETA_RECOMENDADO, '27', 99, 500);
    const r = await resolverEscaneo(otro, deps());
    expect(r.tipo === 'etiqueta' && r.linea).toMatchObject({ ok: false, error: 'plu_inexistente' });
  });

  it('Enter en el buscador: solo dígitos de 6 a 14 son un código', () => {
    expect(pareceCodigoDeBarras('7701234567890')).toBe(true);
    expect(pareceCodigoDeBarras(' 12345678 ')).toBe(true);
    expect(pareceCodigoDeBarras('12345')).toBe(false);
    expect(pareceCodigoDeBarras('queso')).toBe(false);
    expect(pareceCodigoDeBarras('3*7701234567890')).toBe(false);
    expect(pareceCodigoDeBarras('QUE-1')).toBe(false);
  });
});
