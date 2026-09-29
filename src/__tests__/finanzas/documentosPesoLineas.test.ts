/**
 * Productos por peso o medida en FINANZAS e INVENTARIO fuera del POS
 * (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §9): cada línea de documento
 * lleva sus decimales y su unidad según el producto; la cantidad se guarda a
 * esos decimales; recepciones y ajustes respetan el producto.
 */
import {
  CANTIDAD_SIN_REGLA,
  cantidadInicialLinea,
  cantidadLineaDeProducto,
  redondearCantidadLinea,
  sumaCantidades,
} from '@/lib/services/documentos/cantidadLinea';
import {
  decimalesCantidad,
  decimalesDocumento,
  decimalesLinea,
  numeroCantidadLinea,
  textoCantidadLinea,
} from '@/components/kit/documento/documentoLineasLogica';
import { ajustarAFaltantes, faltanteLinea, lineaAItem, pedidoPorProducto, type LineaVenta } from '@/lib/finanzas/ventas/lineasFacturaVenta';
import { cantidadDeProductoAjuste } from '@/components/inventario/ajustes/logica';
import { lineaDeItem } from '@/lib/documents/server/base';

const QUESO = { sale_mode: 'weight', qty_decimals: 3, unit_code: 'KG  ' };
const TELA = { sale_mode: 'measure', qty_decimals: 2, unit_code: 'MT' };
const GASEOSA = { sale_mode: 'unit', qty_decimals: 0, unit_code: 'UN' };

describe('cantidadLineaDeProducto: la línea toma unidad y decimales del producto', () => {
  test('por peso: kg y 3 decimales; por medida: m y 2; por unidad: sin regla', () => {
    expect(cantidadLineaDeProducto(QUESO)).toEqual({ unidad: 'kg', decimalesCantidad: 3 });
    expect(cantidadLineaDeProducto(TELA)).toEqual({ unidad: 'm', decimalesCantidad: 2 });
    expect(cantidadLineaDeProducto({ sale_mode: 'weight', unit_code: 'LB' })).toEqual({ unidad: 'lb', decimalesCantidad: 3 });
    expect(cantidadLineaDeProducto(GASEOSA)).toEqual(CANTIDAD_SIN_REGLA);
    // Un producto por unidad en LT (datos de antes de la fase 1) no se vuelve decimal.
    expect(cantidadLineaDeProducto({ sale_mode: 'unit', unit_code: 'LT' })).toEqual(CANTIDAD_SIN_REGLA);
    expect(cantidadLineaDeProducto(null)).toEqual(CANTIDAD_SIN_REGLA);
  });

  test('cantidad inicial: por unidad 1 (o el mínimo); por peso vacía (0) o el mínimo redondeado', () => {
    expect(cantidadInicialLinea({ decimalesCantidad: null })).toBe(1);
    expect(cantidadInicialLinea({ decimalesCantidad: null }, 12)).toBe(12);
    expect(cantidadInicialLinea({ decimalesCantidad: 3 })).toBe(0);
    expect(cantidadInicialLinea({ decimalesCantidad: 3 }, null)).toBe(0);
    expect(cantidadInicialLinea({ decimalesCantidad: 3 }, 25)).toBe(25);
    expect(cantidadInicialLinea({ decimalesCantidad: 2 }, 1.255)).toBe(1.26);
  });

  test('redondeo antes de guardar: a los decimales del producto; sin regla, igual', () => {
    expect(redondearCantidadLinea(0.7354, { decimalesCantidad: 3 })).toBe(0.735);
    expect(redondearCantidadLinea(0.7355, { decimalesCantidad: 3 })).toBe(0.736);
    expect(redondearCantidadLinea(1.005, { decimalesCantidad: 2 })).toBe(1.01);
    expect(redondearCantidadLinea(1.5, { decimalesCantidad: null })).toBe(1.5);
  });

  test('suma de cantidades sin ruido binario', () => {
    expect(sumaCantidades([0.1, 0.2])).toBe(0.3);
    expect(sumaCantidades([0.735, 1.25, 3])).toBe(4.985);
  });
});

describe('Kit DocumentoLineas: decimales POR LÍNEA', () => {
  const lineas = [
    { cantidad: 2 },
    { cantidad: 0, decimalesCantidad: 3, unidad: 'kg' },
    { cantidad: 1.5, decimalesCantidad: 2, unidad: 'm' },
  ];

  test('una línea nueva de un producto por kg admite 3 decimales aunque valga 0', () => {
    // Antes: los decimales salían de los VALORES → 0 → no se podía escribir 0,735.
    expect(decimalesCantidad([{ cantidad: 2 }, { cantidad: 0 }])).toBe(0);
    const porDefecto = decimalesDocumento(lineas);
    expect(porDefecto).toBe(0);
    expect(decimalesLinea(lineas[1], porDefecto)).toBe(3);
    expect(decimalesLinea(lineas[2], porDefecto)).toBe(2);
    expect(decimalesLinea(lineas[0], porDefecto)).toBe(0);
  });

  test('las líneas por unidad ya no heredan los 3 decimales de una línea por peso', () => {
    const d = decimalesDocumento([{ cantidad: 3 }, { cantidad: 0.735, decimalesCantidad: 3 }]);
    expect(d).toBe(0);
    // Sin regla propia sigue mandando el valor (un ítem manual de 1,5 horas).
    expect(decimalesDocumento([{ cantidad: 1.5 }, { cantidad: 2 }])).toBe(1);
    expect(decimalesDocumento([{ cantidad: 1.5 }], 0)).toBe(0);
  });

  test('nunca menos decimales que los del valor guardado (no redondea en silencio)', () => {
    expect(decimalesLinea({ cantidad: 1.255, decimalesCantidad: 2 }, 0)).toBe(3);
  });

  test.each([
    ['es-CO', '0,735 kg', '2,50 m', '3'],
    ['en-US', '0.735 kg', '2.50 m', '3'],
    ['fr-FR', '0,735 kg', '2,50 m', '3'],
    ['pt-BR', '0,735 kg', '2,50 m', '3'],
  ])('texto de la cantidad en %s', (locale, kg, m, un) => {
    expect(textoCantidadLinea({ cantidad: 0.735, decimalesCantidad: 3, unidad: 'kg' }, locale, 0)).toBe(kg);
    expect(textoCantidadLinea({ cantidad: 2.5, decimalesCantidad: 2, unidad: 'm' }, locale, 0)).toBe(m);
    expect(textoCantidadLinea({ cantidad: 3 }, locale, 0)).toBe(un);
    expect(numeroCantidadLinea({ cantidad: 0.735, decimalesCantidad: 3 }, locale, 0, 0)).toBe(locale === 'en-US' ? '0.000' : '0,000');
  });
});

describe('Factura de venta: cantidad decimal hasta el payload', () => {
  const linea = (c: Partial<LineaVenta>): LineaVenta => ({
    clave: 'l1',
    product_id: 7,
    descripcion: 'Queso campesino',
    sku: 'QUE-KG',
    cantidad: 0.735,
    precio: 18900,
    descuento: 0,
    impuestos: [],
    nota: null,
    manual: false,
    serial: false,
    controlaStock: true,
    stock: 5,
    unidad: 'kg',
    decimalesCantidad: 3,
    ...c,
  });

  test('0,735 kg × $ 18.900 = $ 13.891,50 exacto (sin redondear la línea)', () => {
    const item = lineaAItem(linea({}), false);
    expect(item.qty).toBe(0.735);
    expect(item.total_line).toBe(13891.5);
  });

  test('una cantidad con más decimales que el producto se redondea y el total sale de esa cantidad', () => {
    const item = lineaAItem(linea({ cantidad: 0.7354 }), false);
    expect(item.qty).toBe(0.735);
    expect(item.total_line).toBe(13891.5);
    // Por unidad no se toca (servicio de 1,5 horas).
    expect(lineaAItem(linea({ cantidad: 1.5, unidad: null, decimalesCantidad: null, precio: 1000 }), false).qty).toBe(1.5);
  });

  test('faltantes y «Ajustar y emitir» con 3 decimales (antes 0,265 se volvía 0,27)', () => {
    const lineas = [linea({ clave: 'a', cantidad: 1 })];
    expect(pedidoPorProducto([linea({ cantidad: 0.735 }), linea({ cantidad: 0.4 })]).get(7)).toBe(1.135);
    expect(faltanteLinea({ ...lineas[0], stock: 0.735 })).toBe(0.265);
    const r = ajustarAFaltantes(lineas, [{ product_id: 7, disponible: 0.735 } as never]);
    expect(r.lineas[0].cantidad).toBe(0.735);
    expect(r.cambios).toEqual([{ clave: 'a', descripcion: 'Queso campesino', antes: 1, despues: 0.735 }]);
  });
});

describe('PDF: la línea de la factura toma unidad y decimales del producto (helper único)', () => {
  test('lineaDeItem con producto por kg, por medida y por unidad', () => {
    const base = { code_reference: null, description: 'X', unit_price: 1000, discount_amount: 0, tax_code: null, tax_rate: 0, tax_included: false, total_line: 735, note: null, serial_numbers: [] };
    expect(lineaDeItem({ ...base, qty: 0.735, producto: { sku: 'Q', ...QUESO } })).toMatchObject({ cantidad: 0.735, unidad: 'kg', decimalesCantidad: 3 });
    expect(lineaDeItem({ ...base, qty: 2.5, producto: [{ sku: 'T', ...TELA }] })).toMatchObject({ unidad: 'm', decimalesCantidad: 2 });
    expect(lineaDeItem({ ...base, qty: 3, producto: { sku: 'G', ...GASEOSA } })).toMatchObject({ unidad: null, decimalesCantidad: null });
  });
});

describe('Ajustes de inventario: decimales por producto', () => {
  test('por peso 3 decimales y «kg»; por unidad enteros; sin dato de la base, 3 como antes', () => {
    expect(cantidadDeProductoAjuste({ modo_venta: 'weight', decimales_cantidad: 3, unidad: 'KG' })).toEqual({ decimales: 3, unidad: 'kg' });
    expect(cantidadDeProductoAjuste({ modo_venta: 'measure', decimales_cantidad: 2, unidad: 'LT' })).toEqual({ decimales: 2, unidad: 'L' });
    expect(cantidadDeProductoAjuste({ modo_venta: 'unit', decimales_cantidad: 0, unidad: 'UN' })).toEqual({ decimales: 0, unidad: null });
    expect(cantidadDeProductoAjuste({ modo_venta: null, decimales_cantidad: null, unidad: 'UN' })).toEqual({ decimales: 3, unidad: null });
  });

  test('un borrador con más decimales que el producto no se redondea al abrirlo', () => {
    expect(cantidadDeProductoAjuste({ modo_venta: 'unit', decimales_cantidad: 0, unidad: 'UN' }, 2.5).decimales).toBe(1);
  });
});
