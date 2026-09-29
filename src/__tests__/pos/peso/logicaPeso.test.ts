/**
 * Productos por peso (docs/design/PRODUCTOS-POR-PESO-BASCULA.md): cálculo,
 * validación, precio «cada tanto» y redondeo al cobrar. Las fechas no
 * intervienen, pero se corre también con TZ=America/Bogota (test:tz-all).
 */
import {
  cantidadDesdeTexto,
  decimalesCantidad,
  esMedido,
  formatoCantidad,
  modoVenta,
  pasoCantidad,
  redondearCantidadProducto,
  simboloUnidad,
  unidadVisible,
  referenciasPermitidas,
  referenciaDelProducto,
  precioPorUnidadDesdeReferencia,
  precioEnReferencia,
  referenciaValida,
  validarPesada,
  pesajeManual,
  importePesada,
  puedePesarAMano,
  totalACobrar,
  cambioRedondeado,
  pagosConRedondeo,
  type ProductoModoVenta,
} from '@/lib/pos/peso';
import { calcularLineaVenta } from '@/lib/pos/lineaVenta';

const QUESO: ProductoModoVenta = { sale_mode: 'weight', qty_decimals: 3, unit_code: 'KG  ' };
const TELA: ProductoModoVenta = { sale_mode: 'measure', qty_decimals: 2, unit_code: 'MT' };
const GASEOSA: ProductoModoVenta = { sale_mode: 'unit', qty_decimals: 0, unit_code: 'UN' };

describe('modo de venta y decimales', () => {
  test('sin sale_mode es por unidad; decimales efectivos como fn_producto_decimales_cantidad', () => {
    expect(modoVenta({})).toBe('unit');
    expect(modoVenta({ sale_mode: 'raro' })).toBe('unit');
    expect(decimalesCantidad(GASEOSA)).toBe(0);
    expect(decimalesCantidad(QUESO)).toBe(3);
    expect(decimalesCantidad({ sale_mode: 'weight', qty_decimals: 0 })).toBe(3);
    expect(decimalesCantidad({ sale_mode: 'measure' })).toBe(2);
    expect(esMedido(TELA)).toBe(true);
    expect(esMedido(GASEOSA)).toBe(false);
  });

  test('redondeo de la cantidad a los decimales del producto (0,7354 → 0,735)', () => {
    expect(redondearCantidadProducto(0.7354, 3)).toBe(0.735);
    expect(redondearCantidadProducto(0.7355, 3)).toBe(0.736);
    expect(redondearCantidadProducto(1.005, 2)).toBe(1.01);
    expect(redondearCantidadProducto(2.4, 0)).toBe(2);
  });

  test('símbolo y unidad visible solo en productos medidos', () => {
    expect(simboloUnidad('KG  ')).toBe('kg');
    expect(simboloUnidad('LB')).toBe('lb');
    expect(simboloUnidad('LT')).toBe('L');
    expect(unidadVisible(QUESO)).toBe('kg');
    expect(unidadVisible(GASEOSA)).toBeNull();
    expect(pasoCantidad(3)).toBe(0.001);
    expect(pasoCantidad(0)).toBe(1);
  });
});

describe('cantidadDesdeTexto', () => {
  test('acepta coma o punto y hasta los decimales del producto', () => {
    expect(cantidadDesdeTexto('0,735', 3)).toBe(0.735);
    expect(cantidadDesdeTexto('1.5', 3)).toBe(1.5);
    expect(cantidadDesdeTexto(',5', 3)).toBe(0.5);
    expect(cantidadDesdeTexto(' 2 ', 3)).toBe(2);
  });

  test('rechaza más decimales, cero, negativos y texto (nunca trunca en silencio)', () => {
    expect(cantidadDesdeTexto('0,7354', 3)).toBeNull();
    expect(cantidadDesdeTexto('0', 3)).toBeNull();
    expect(cantidadDesdeTexto('-1', 3)).toBeNull();
    expect(cantidadDesdeTexto('abc', 3)).toBeNull();
    expect(cantidadDesdeTexto('', 3)).toBeNull();
  });

  test('por unidad solo enteros, como antes', () => {
    expect(cantidadDesdeTexto('3')).toBe(3);
    expect(cantidadDesdeTexto('1,5')).toBeNull();
  });
});

describe('formatoCantidad', () => {
  test('peso con 3 decimales y unidad; unidad sin decimales', () => {
    expect(formatoCantidad(0.735, QUESO)).toBe('0,735 kg');
    expect(formatoCantidad(2.5, TELA)).toBe('2,50 m');
    expect(formatoCantidad(3, GASEOSA)).toBe('3');
    expect(formatoCantidad(0.735, QUESO, 'en-US')).toBe('0.735 kg');
  });
});

describe('precio «cada tanto»', () => {
  test('en kg: 1 kg, 500, 250, 100 y 50 g; en lb y por medida, solo la unidad', () => {
    expect(referenciasPermitidas('KG').map((r) => `${r.cantidad}${r.unidad}`)).toEqual(['1KG', '500GR', '250GR', '100GR', '50GR']);
    expect(referenciasPermitidas('LB')).toEqual([{ cantidad: 1, unidad: 'LB' }]);
    expect(referenciasPermitidas('MT')).toEqual([{ cantidad: 1, unidad: 'MT' }]);
  });

  test('$ 1.890 cada 100 g se guarda como $ 18.900 / kg y se muestra de vuelta', () => {
    const ref = { cantidad: 100, unidad: 'GR' };
    expect(precioPorUnidadDesdeReferencia(1890, ref, 'KG', 0)).toBe(18900);
    expect(precioEnReferencia(18900, ref, 'KG', 0)).toBe(1890);
    expect(precioPorUnidadDesdeReferencia(4725, { cantidad: 250, unidad: 'GR' }, 'KG', 0)).toBe(18900);
  });

  test('«cada 300 g» no es válida (precio por kg periódico)', () => {
    expect(referenciaValida({ cantidad: 300, unidad: 'GR' }, 'KG')).toBe(false);
    expect(precioPorUnidadDesdeReferencia(5670, { cantidad: 300, unidad: 'GR' }, 'KG', 0)).toBeNull();
  });

  test('referencia del producto: la guardada o la unidad de venta', () => {
    expect(referenciaDelProducto({ unit_code: 'KG', price_ref_qty: '100.000', price_ref_unit_code: 'GR  ' })).toEqual({ cantidad: 100, unidad: 'GR' });
    expect(referenciaDelProducto({ unit_code: 'KG  ' })).toEqual({ cantidad: 1, unidad: 'KG' });
  });
});

describe('validarPesada', () => {
  test('peso a mano con permiso: ok y redondeado', () => {
    expect(validarPesada({ producto: QUESO, cantidad: 0.735, origen: 'manual', permisoPesoManual: true })).toEqual({ ok: true, cantidad: 0.735 });
  });

  test('sin permiso, exige báscula, bajo mínimo, decimales de más, cero', () => {
    expect(validarPesada({ producto: QUESO, cantidad: 0.735, origen: 'manual', permisoPesoManual: false })).toMatchObject({ ok: false, error: 'manual_sin_permiso' });
    expect(validarPesada({ producto: { ...QUESO, require_scale: true }, cantidad: 0.735, origen: 'manual', permisoPesoManual: true })).toMatchObject({ ok: false, error: 'exige_bascula' });
    expect(validarPesada({ producto: { ...QUESO, min_sale_qty: '0.050' }, cantidad: 0.04, origen: 'manual', permisoPesoManual: true })).toMatchObject({ ok: false, error: 'bajo_minimo', minimo: 0.05 });
    expect(validarPesada({ producto: QUESO, cantidad: 0.7354, origen: 'manual', permisoPesoManual: true })).toMatchObject({ ok: false, error: 'demasiados_decimales', decimales: 3 });
    expect(validarPesada({ producto: QUESO, cantidad: null, origen: 'manual', permisoPesoManual: true })).toMatchObject({ ok: false, error: 'peso_invalido' });
  });

  test('por medida no pide permiso de peso', () => {
    expect(validarPesada({ producto: TELA, cantidad: 2.5, origen: 'manual', permisoPesoManual: false })).toEqual({ ok: true, cantidad: 2.5 });
  });

  test('puedePesarAMano y registro de la pesada', () => {
    expect(puedePesarAMano(QUESO, true)).toBe(true);
    expect(puedePesarAMano({ require_scale: true }, true)).toBe(false);
    const p = pesajeManual(QUESO, 0.735, new Date('2026-09-29T15:00:00Z'));
    expect(p).toEqual({ origen: 'manual', neto: 0.735, unidad: 'KG', leido_en: '2026-09-29T15:00:00.000Z' });
  });
});

describe('importe exacto de la línea (regla única del servidor)', () => {
  test('0,735 kg × $ 18.900 = $ 13.891,50 sin redondear', () => {
    expect(importePesada(0.735, 18900)).toBeCloseTo(13891.5, 6);
    const l = calcularLineaVenta({ quantity: 0.735, unit_price: 18900, tax_rate: 0, tax_included: false });
    expect(l.total).toBeCloseTo(13891.5, 6);
  });

  test('con IVA incluido el impuesto va a 2 decimales y el total queda exacto', () => {
    const l = calcularLineaVenta({ quantity: 1.25, unit_price: 11900, tax_rate: 19, tax_included: true });
    expect(l.total).toBeCloseTo(14875, 6);
    expect(l.taxAmount).toBe(2375);
  });
});

describe('redondeo al cobrar', () => {
  test('total a cobrar medio hacia arriba; cambio hacia abajo', () => {
    expect(totalACobrar(13891.5, 0)).toBe(13892);
    expect(totalACobrar(9185.4, 0)).toBe(9185);
    expect(totalACobrar(1.46265, 2)).toBe(1.46);
    expect(cambioRedondeado(13892, 13891.5, 0)).toBe(0);
    expect(cambioRedondeado(20000, 13891.5, 0)).toBe(6108);
  });

  test('el faltante por redondeo se suma al último pago (el sobre cuadra con el total exacto)', () => {
    const r = pagosConRedondeo({ pagos: [{ method: 'cash', amount: 9185 }], totalPagado: 9185, cambio: 0, totalExacto: 9185.4 });
    expect(r).toEqual({ pagos: [{ method: 'cash', amount: 9185.4 }], totalPagado: 9185.4 });
  });

  test('sin faltante, o con un faltante real, no toca los pagos', () => {
    const pagos = [{ method: 'card', amount: 13892 }];
    expect(pagosConRedondeo({ pagos, totalPagado: 13892, cambio: 0, totalExacto: 13891.5 }).pagos).toBe(pagos);
    expect(pagosConRedondeo({ pagos, totalPagado: 13000, cambio: 0, totalExacto: 13891.5 }).totalPagado).toBe(13000);
  });
});
