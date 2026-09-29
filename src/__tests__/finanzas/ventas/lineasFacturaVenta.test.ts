/**
 * Factura de venta v2 — cálculo de líneas y totales, faltantes, payload e
 * impuestos de líneas guardadas (`lib/finanzas/ventas/lineasFacturaVenta.ts`)
 * y validación del formulario. Las reglas son las de la base
 * (`fn_factura_venta_guardar`, `computeLineTotal`): lo que se ve es lo que se
 * guarda.
 */
import {
  ajustarAFaltantes,
  calcularLineaVenta,
  comisionEstimada,
  errorComision,
  faltanteLinea,
  impuestosAplicados,
  impuestosDeLineaGuardada,
  lineaAItem,
  pedidoPorProducto,
  totalesFacturaVenta,
  vencimientoPorTerminos,
  type LineaVenta,
} from '@/lib/finanzas/ventas/lineasFacturaVenta';
import { validarClaves } from '@/components/finanzas/facturas-venta/formulario/validacionFacturaVenta';

const IVA = { id: 'iva', codigo: 'IVA_19', nombre: 'IVA', tarifa: 19 };
const ULTRA = { id: 'ul', codigo: null, nombre: 'Ultraprocesados', tarifa: 20 };
const INC = { id: 'inc', codigo: 'INC_8', nombre: 'INC', tarifa: 8 };

const linea = (x: Partial<LineaVenta> = {}): LineaVenta => ({
  clave: 'a',
  product_id: 1,
  descripcion: 'Zapatilla',
  sku: null,
  cantidad: 2,
  precio: 100000,
  descuento: 0,
  impuestos: [IVA],
  nota: null,
  manual: false,
  serial: false,
  controlaStock: true,
  stock: 10,
  ...x,
});

describe('cálculo de la línea', () => {
  test('IVA adicional: total = neto × 1,19', () => {
    expect(calcularLineaVenta(linea(), false)).toEqual(expect.objectContaining({ neto: 200000, base: 200000, impuesto: 38000, total_line: 238000 }));
  });

  test('IVA incluido: base = round(neto / 1,19) y el total es el neto', () => {
    const k = calcularLineaVenta(linea({ cantidad: 1, precio: 119000 }), true);
    expect(k).toEqual(expect.objectContaining({ base: 100000, impuesto: 19000, total_line: 119000 }));
  });

  test('varios impuestos (decisión 5): tarifa sumada y el impuesto repartido por tarifa sin perder centavos', () => {
    const k = calcularLineaVenta(linea({ cantidad: 3, precio: 333.33, impuestos: [IVA, ULTRA] }), false);
    expect(k.total_line).toBe(Math.round(999.99 * 1.39 * 100) / 100);
    const suma = k.porImpuesto.reduce((s, i) => s + Math.round(i.importe * 100), 0) / 100;
    expect(suma).toBeCloseTo(k.impuesto, 2);
    expect(k.porImpuesto.map((i) => i.id)).toEqual(['iva', 'ul']);
  });

  test('descuento resta antes del impuesto; sin impuesto la línea queda al 0 %', () => {
    expect(calcularLineaVenta(linea({ descuento: 20000 }), false).total_line).toBe(214200);
    expect(calcularLineaVenta(linea({ impuestos: [] }), false)).toEqual(expect.objectContaining({ impuesto: 0, total_line: 200000 }));
  });
});

describe('totales del documento', () => {
  test('agrupa por impuesto con su base; total = suma de líneas', () => {
    const r = totalesFacturaVenta(
      [linea(), linea({ clave: 'b', cantidad: 1, precio: 50000, impuestos: [INC] }), linea({ clave: 'c', cantidad: 1, precio: 10000, impuestos: [IVA, ULTRA] })],
      false,
    );
    expect(r.subtotal).toBe(260000);
    expect(r.total).toBe(238000 + 54000 + 13900);
    expect(r.impuestoTotal).toBe(r.total - r.subtotal);
    expect(r.impuestos).toEqual([
      expect.objectContaining({ clave: 'iva', base: 210000, importe: 38000 + 1900 }),
      expect.objectContaining({ clave: 'inc', base: 50000, importe: 4000 }),
      expect.objectContaining({ clave: 'ul', base: 10000, importe: 2000 }),
    ]);
    expect(r.lineasSinImpuesto).toBe(0);
  });

  test('cuenta las líneas al 0 %', () => {
    expect(totalesFacturaVenta([linea({ impuestos: [] })], false).lineasSinImpuesto).toBe(1);
  });
});

describe('payload de la línea (contrato de fn_factura_venta_guardar)', () => {
  test('un impuesto: tax_code/tax_rate, sin detalle; la nota viaja', () => {
    expect(lineaAItem(linea({ nota: ' Entrega 3 oct ' }), false)).toEqual({
      product_id: 1,
      description: 'Zapatilla',
      qty: 2,
      unit_price: 100000,
      tax_code: 'IVA_19',
      tax_rate: 19,
      tax_included: false,
      total_line: 238000,
      discount_amount: 0,
      note: 'Entrega 3 oct',
    });
  });

  test('varios impuestos: tasa sumada, código del primero y detalle en taxes', () => {
    const it = lineaAItem(linea({ impuestos: [IVA, ULTRA] }), false);
    expect(it).toEqual(expect.objectContaining({ tax_code: 'IVA_19', tax_rate: 39, taxes: [IVA, ULTRA] }));
  });

  test('serializado: los seriales elegidos de su producto', () => {
    expect(lineaAItem(linea({ serial: true }), false, [7, 8]).serial_ids).toEqual([7, 8]);
    expect('serial_ids' in lineaAItem(linea(), false, [7])).toBe(false);
  });

  test('impuestos aplicados del documento: códigos usados, sin repetir ni tarifas 0', () => {
    expect(impuestosAplicados([linea(), linea({ clave: 'b', impuestos: [IVA, ULTRA, INC] }), linea({ clave: 'c', impuestos: [] })])).toEqual([
      { tax_code: 'IVA_19', tax_rate: 19 },
      { tax_code: 'INC_8', tax_rate: 8 },
    ]);
  });
});

describe('líneas guardadas → impuestos (nada se pierde al editar)', () => {
  const opciones = [IVA, INC];
  test('detalle guardado manda', () => {
    expect(impuestosDeLineaGuardada({ tax_code: 'IVA_19', tax_rate: 39, impuestos_linea: [IVA, ULTRA] }, opciones)).toEqual([IVA, ULTRA]);
  });
  test('por código y tarifa; si el impuesto ya no existe, uno sintético con lo guardado', () => {
    expect(impuestosDeLineaGuardada({ tax_code: 'inc_8', tax_rate: 8 }, opciones)).toEqual([INC]);
    expect(impuestosDeLineaGuardada({ tax_code: null, tax_rate: 19 }, opciones)).toEqual([IVA]);
    expect(impuestosDeLineaGuardada({ tax_code: 'IVA_5', tax_rate: 5 }, opciones)).toEqual([{ id: 'tx:IVA_5', codigo: 'IVA_5', nombre: 'IVA_5', tarifa: 5 }]);
    expect(impuestosDeLineaGuardada({ tax_code: null, tax_rate: 0 }, opciones)).toEqual([]);
  });
});

describe('stock y faltantes (M3, decisión 6)', () => {
  test('aviso por línea con lo pedido del producto en toda la factura', () => {
    const ls = [linea({ cantidad: 4, stock: 5 }), linea({ clave: 'b', cantidad: 3, stock: 5 })];
    const pedido = pedidoPorProducto(ls);
    expect(pedido.get(1)).toBe(7);
    expect(faltanteLinea(ls[0], pedido.get(1))).toBe(2);
    expect(faltanteLinea(linea({ controlaStock: false, stock: 0 }))).toBe(0);
    expect(faltanteLinea(linea({ product_id: null, stock: 0 }))).toBe(0);
  });

  test('«Ajustar y emitir» recorta desde la última línea del producto y muestra el cambio antes', () => {
    const ls = [linea({ cantidad: 4 }), linea({ clave: 'b', cantidad: 3 }), linea({ clave: 'c', product_id: 2, descripcion: 'Morral', cantidad: 2 })];
    const r = ajustarAFaltantes(ls, [
      { product_id: 1, producto: 'Zapatilla', requerido: 7, disponible: 5 },
      { product_id: 2, producto: 'Morral', requerido: 2, disponible: 0 },
    ]);
    expect(r.cambios).toEqual([
      { clave: 'b', descripcion: 'Zapatilla', antes: 3, despues: 1 },
      { clave: 'c', descripcion: 'Morral', antes: 2, despues: 0 },
    ]);
    expect(r.lineas.map((l) => [l.clave, l.cantidad])).toEqual([
      ['a', 4],
      ['b', 1],
    ]);
  });
});

describe('fechas y comisión', () => {
  test('L5: vencimiento = emisión + términos en días calendario', () => {
    expect(vencimientoPorTerminos('2026-09-28', 30)).toBe('2026-10-28');
    expect(vencimientoPorTerminos('2026-02-27', 2)).toBe('2026-03-01');
    expect(vencimientoPorTerminos('2026-09-28', 0)).toBe('2026-09-28');
  });

  test('L8: comisión sobre el subtotal sin impuestos; límites', () => {
    expect(comisionEstimada('percentage', 5, 200000, 238000)).toBe(10000);
    expect(comisionEstimada('percentage', 5, 0, 238000)).toBe(11900);
    expect(comisionEstimada('fixed_amount', 3000, 200000, 238000)).toBe(3000);
    expect(errorComision('percentage', 101, 1, 1)).toBe('porcentajeExcede');
    expect(errorComision('fixed_amount', 300000, 200000, 238000)).toBe('montoExcede');
    expect(errorComision('percentage', 0, 0, 0)).toBeNull();
  });
});

describe('validación del formulario (M4)', () => {
  const base = {
    cliente: 'c1',
    sucursal: 3,
    emision: '2026-09-28',
    vence: '2026-10-28',
    lineas: [linea()],
    seriales: {},
    tasaComision: 0,
    metodoComision: 'percentage' as const,
    subtotal: 200000,
    total: 238000,
    paraEmitir: false,
  };
  test('lo mínimo para guardar', () => {
    expect(validarClaves(base)).toEqual({});
    expect(validarClaves({ ...base, cliente: null, sucursal: null, lineas: [], vence: '2026-09-01' })).toEqual({ cliente: 'cliente', sucursal: 'sucursal', lineas: 'lineas', vence: 'vence' });
  });
  test('errores por línea', () => {
    const r = validarClaves({ ...base, lineas: [linea({ descripcion: ' ' }), linea({ clave: 'b', cantidad: 0 }), linea({ clave: 'c', descuento: 999999 })] });
    expect(r).toEqual({ 'linea.a': 'descripcion', 'linea.b': 'cantidad', 'linea.c': 'descuento' });
  });
  test('L9: seriales incompletos bloquean EMITIR, no el borrador', () => {
    const conSerial = { ...base, lineas: [linea({ serial: true })] };
    expect(validarClaves(conSerial)).toEqual({});
    expect(validarClaves({ ...conSerial, paraEmitir: true })).toEqual({ 'linea.a': 'seriales' });
    expect(validarClaves({ ...conSerial, paraEmitir: true, seriales: { 1: [5, 6] } })).toEqual({});
  });
});
