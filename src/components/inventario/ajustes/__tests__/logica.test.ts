/**
 * Ajustes y ajuste por conteo (B2): la lógica pura del formulario, del detalle y
 * de los errores. La diferencia real la decide `fn_ajuste_aplicar`; esto es la
 * vista previa y la validación que la interfaz hace antes de llamar.
 */
import type { ProductoParaAjuste } from '@/lib/services/adjustmentService';
import {
  aBorrador,
  agregarLinea,
  calcularLinea,
  cambiarLote,
  diferenciaDe,
  lineasDesdeDetalle,
  mensajeErrorAjuste,
  modoDesdeUrl,
  nuevaClaveAplicar,
  resumirLineas,
  rutaNuevoAjuste,
  validarAjuste,
  type LineaAjuste,
} from '../logica';

function producto(p: Partial<ProductoParaAjuste> & { id: number }): ProductoParaAjuste {
  return {
    nombre: `Producto ${p.id}`,
    sku: `SKU-${p.id}`,
    codigo_barras: null,
    unidad: 'UN',
    controla_lotes: false,
    controla_serial: false,
    existencias: [],
    lotes: [],
    costo_vigente: null,
    seriales_en_stock: [],
    ...p,
  };
}

const crema = producto({ id: 1, controla_lotes: true, existencias: [{ lot_id: 7, lote: 'L-7', vence: '2026-01-01', cantidad: 14, costo_promedio: 18500 }], lotes: [{ lot_id: 7, lote: 'L-7', vence: '2026-01-01' }] });
const cafe = producto({ id: 2, existencias: [{ lot_id: null, lote: null, vence: null, cantidad: -3, costo_promedio: 21000 }] });
const tenis = producto({ id: 3, existencias: [{ lot_id: null, lote: null, vence: null, cantidad: 240, costo_promedio: 128000 }] });
const audifonos = producto({ id: 4, controla_serial: true, existencias: [{ lot_id: null, lote: null, vence: null, cantidad: 6, costo_promedio: 145000 }], seriales_en_stock: ['AX2-00931', 'AX2-00932'] });
const sinCosto = producto({ id: 5, existencias: [{ lot_id: null, lote: null, vence: null, cantidad: 2, costo_promedio: 0 }] });

function linea(p: ProductoParaAjuste, cantidad: number | null, extra: Partial<LineaAjuste> = {}): LineaAjuste {
  const lot = extra.lot_id ?? (p.controla_lotes ? p.lotes[0]?.lot_id ?? null : null);
  return { clave: `${p.id}:${lot ?? '-'}`, producto: p, lot_id: lot, cantidad, costo: null, seriales: [], ...extra };
}

describe('diferencia y resumen (Figma 586:312944)', () => {
  it('conteo: contado − sistema; entrada suma; salida resta', () => {
    expect(diferenciaDe('conteo', 0, 14)).toBe(-14);
    expect(diferenciaDe('conteo', 0, -3)).toBe(3);
    expect(diferenciaDe('entrada', 5, 10)).toBe(5);
    expect(diferenciaDe('salida', 2.5, 10)).toBe(-2.5);
    expect(diferenciaDe('conteo', null, 10)).toBeNull();
    // Sin ruido de coma flotante.
    expect(diferenciaDe('conteo', 0.3, 0.1)).toBe(0.2);
  });

  it('el ejemplo del Figma: 4 productos, −17 faltantes, +3 sobrantes, −$597.000', () => {
    const r = resumirLineas('conteo', [linea(crema, 0), linea(cafe, 0), linea(tenis, 238), linea(audifonos, 5)]);
    expect(r).toMatchObject({ productos: 4, faltantes: -17, sobrantes: 3, productosFaltantes: 3, productosSobrantes: 1, neto: -14, impacto: -597000 });
  });

  it('el impacto queda en null si un renglón con diferencia no tiene costo', () => {
    const r = resumirLineas('conteo', [linea(tenis, 238), linea(sinCosto, 5)]);
    expect(r.impacto).toBeNull();
    expect(r.sobrantes).toBe(3);
  });

  it('el costo escrito manda sobre el promedio; si no hay, el costo vigente', () => {
    expect(calcularLinea('conteo', linea(sinCosto, 5, { costo: 900 })).costo).toBe(900);
    expect(calcularLinea('conteo', linea({ ...sinCosto, costo_vigente: 700 }, 5)).costo).toBe(700);
    expect(calcularLinea('conteo', linea(sinCosto, 5)).costo).toBeNull();
  });
});

describe('validación antes de guardar y de aplicar', () => {
  const base = { sucursal: 2, razon: 'physical_count', fechaLocal: '2026-09-23T10:40', modo: 'conteo' as const };

  it('cabecera: sucursal, razón, fecha y al menos un renglón', () => {
    const v = validarAjuste({ sucursal: null, razon: ' ', fechaLocal: '', modo: 'conteo', lineas: [] }, false);
    expect(v.cabecera).toEqual(['sucursal', 'razon', 'fecha', 'sinRenglones']);
    expect(v.valido).toBe(false);
  });

  it('borrador: basta con cantidades válidas (un sobrante sin costo se puede guardar)', () => {
    expect(validarAjuste({ ...base, lineas: [linea(sinCosto, 5)] }, false).valido).toBe(true);
    expect(validarAjuste({ ...base, lineas: [linea(tenis, null)] }, false).lineas).toEqual({ '3:-': 'cantidad' });
  });

  it('entrada o salida en 0 no es válida; en conteo 0 sí', () => {
    expect(validarAjuste({ ...base, modo: 'salida', lineas: [linea(tenis, 0)] }, false).lineas['3:-']).toBe('cantidad');
    expect(validarAjuste({ ...base, lineas: [linea(tenis, 0)] }, false).valido).toBe(true);
  });

  it('P5: una salida que deja la fila en negativo no se aplica', () => {
    expect(validarAjuste({ ...base, modo: 'salida', lineas: [linea(tenis, 241)] }, true).lineas['3:-']).toBe('negativo');
    expect(validarAjuste({ ...base, modo: 'salida', lineas: [linea(tenis, 240)] }, true).valido).toBe(true);
  });

  it('aplicar pide costo al sobrante sin costo y tantos seriales como unidades', () => {
    expect(validarAjuste({ ...base, lineas: [linea(sinCosto, 5)] }, true).lineas['5:-']).toBe('costo');
    expect(validarAjuste({ ...base, lineas: [linea(audifonos, 5)] }, true).lineas['4:-']).toBe('seriales');
    expect(validarAjuste({ ...base, lineas: [linea(audifonos, 5, { seriales: ['AX2-00931'] })] }, true).valido).toBe(true);
  });
});

describe('renglones', () => {
  it('agregar no repite el mismo producto y lote; un producto con lotes toma el primero con existencia', () => {
    const a = agregarLinea([], crema);
    expect(a.clave).toBe('1:7');
    const b = agregarLinea(a.lineas, crema);
    expect(b.yaEstaba).toBe(true);
    expect(b.lineas).toHaveLength(1);
  });

  it('cambiar de lote cambia la clave, limpia los seriales y no choca con otro renglón', () => {
    const ls = [linea(crema, 3, { seriales: ['x'] }), { ...linea(crema, 1), clave: '1:-', lot_id: null }];
    expect(cambiarLote(ls, '1:7', null)).toEqual(ls); // ya existe 1:-
    const cambiado = cambiarLote([linea(crema, 3, { seriales: ['x'] })], '1:7', null);
    expect(cambiado[0]).toMatchObject({ clave: '1:-', lot_id: null, seriales: [] });
  });

  it('borrador para fn_ajuste_guardar', () => {
    const b = aBorrador({
      id: 9,
      sucursal: 2,
      modo: 'conteo',
      razon: 'physical_count',
      notas: '  ',
      contadoEn: '2026-09-23T10:40:00.000-05:00',
      lineas: [linea(crema, 0), linea(audifonos, 5, { seriales: ['AX2-00931'] }), linea(sinCosto, 5, { costo: 900 })],
    });
    expect(b).toEqual({
      id: 9,
      branch_id: 2,
      mode: 'conteo',
      reason: 'physical_count',
      notes: null,
      counted_at: '2026-09-23T10:40:00.000-05:00',
      items: [
        { product_id: 1, lot_id: 7, quantity: 0, unit_cost: null, serial_numbers: undefined },
        { product_id: 4, lot_id: null, quantity: 5, unit_cost: null, serial_numbers: ['AX2-00931'] },
        { product_id: 5, lot_id: null, quantity: 5, unit_cost: 900, serial_numbers: undefined },
      ],
    });
  });

  it('editar conserva cantidades; duplicar como nuevo conteo las deja vacías', () => {
    const detalle = {
      ajuste: {} as never,
      movimientos: [],
      asiento: null,
      permisos: {} as never,
      renglones: [
        {
          id: 1,
          producto: { id: 3, nombre: 'Tenis', sku: null, unidad: null, controla_lotes: false, controla_serial: false },
          lote: null,
          cantidad: 238,
          sistema: 240,
          sistema_actual: 240,
          diferencia: -2,
          costo: 128000,
          costo_ingresado: null,
          impacto: -256000,
          seriales: [],
        },
        {
          id: 2,
          producto: { id: 99, nombre: 'Borrado', sku: null, unidad: null, controla_lotes: false, controla_serial: false },
          lote: null,
          cantidad: 1,
          sistema: 0,
          sistema_actual: 0,
          diferencia: 1,
          costo: null,
          costo_ingresado: null,
          impacto: null,
          seriales: [],
        },
      ],
    };
    expect(lineasDesdeDetalle(detalle, [tenis], false)).toEqual([
      { clave: '3:-', producto: tenis, lot_id: null, cantidad: 238, costo: null, seriales: [], sistemaGuardado: 240 },
    ]);
    expect(lineasDesdeDetalle(detalle, [tenis], true)[0]).toMatchObject({ cantidad: null, sistemaGuardado: null });
  });
});

describe('URL y errores', () => {
  it('acepta el ?type= de los enlaces viejos y el ?modo= nuevo', () => {
    expect(modoDesdeUrl(null, 'entrada')).toBe('entrada');
    expect(modoDesdeUrl(null, 'salida')).toBe('salida');
    expect(modoDesdeUrl('conteo', 'salida')).toBe('conteo');
    expect(modoDesdeUrl(null, null)).toBe('conteo');
    expect(rutaNuevoAjuste({ producto: 7, modo: 'entrada', sucursal: 3 })).toBe('/app/inventario/ajustes/nuevo?producto_id=7&modo=entrada&branchId=3');
    expect(rutaNuevoAjuste()).toBe('/app/inventario/ajustes/nuevo');
  });

  it('traduce los errores propios y los del núcleo', () => {
    expect(mensajeErrorAjuste({ message: 'ajuste_descartado', code: '55000' })).toEqual({ ns: 'ajuste', clave: 'ajuste_descartado' });
    expect(
      mensajeErrorAjuste({ message: 'costo_requerido', code: '22023', details: '[{"product_id":5,"nombre":"Queso"}]' }),
    ).toEqual({ ns: 'ajuste', clave: 'costo_requerido', productos: ['Queso'] });
    expect(
      mensajeErrorAjuste({
        message: 'stock_insuficiente',
        code: '23514',
        details: '{"product_id":104,"branch_id":2,"lot_id":null,"disponible":7,"solicitado":100}',
      }),
    ).toEqual({ ns: 'nucleo', clave: 'stock_insuficiente', disponible: 7, solicitado: 100 });
    expect(mensajeErrorAjuste({ message: 'Acceso denegado a la organización', code: '42501' })).toEqual({ ns: 'nucleo', clave: 'sin_permiso' });
  });

  it('cada intento de aplicar lleva su propia clave de idempotencia', () => {
    const a = nuevaClaveAplicar(81);
    expect(a).toMatch(/^ajuste-81-/);
    expect(nuevaClaveAplicar(81)).not.toBe(a);
  });
});
