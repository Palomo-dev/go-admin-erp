/**
 * Lógica de la receta del formulario (docs/design/PRODUCTO-RECETAS-Y-SUBSECCIONES.md §2):
 * borrador, validación en línea, alcance por variante y payload de fn_producto_guardar.
 * Las cantidades convertidas y los costos los calcula el servidor; aquí solo la
 * vista previa y las reglas del formulario.
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

import {
  cantidadBruta,
  copiarReceta,
  destinosReceta,
  detalleConversion,
  duplicados,
  estadoVariante,
  fusionarDuplicado,
  ingredienteDesdeOpcion,
  limpiarRecetasHuerfanas,
  lineaDeFila,
  margenReceta,
  payloadRecetaProducto,
  recetaAPayload,
  recetaFormDesdeServidor,
  recetaFormInicial,
  recetaVacia,
  unidadesCompatibles,
  validarReceta,
  validarRecetaForm,
  type IngredienteBorrador,
  type RecetaBorrador,
  type RecetaForm,
} from '../recetaLogica';
import type { LineaCostoReceta, RecetasFormularioServidor } from '@/lib/services/recipeService';

const pan = { id: 10, nombre: 'Pan brioche', sku: 'PAN-004', unidad: 'UN', trackStock: true };
const carne = { id: 11, nombre: 'Carne molida', sku: 'CAR-010', unidad: 'KG', trackStock: true };
const salsa = { id: 12, nombre: 'Salsa de la casa', sku: 'SAL-001', unidad: 'LT', trackStock: false };

function receta(...ings: Partial<IngredienteBorrador>[]): RecetaBorrador {
  const b = recetaVacia('UN');
  b.ingredientes = ings.map((i, n) => ({ ...ingredienteDesdeOpcion([pan, carne, salsa][n % 3]), ...i }));
  return b;
}

describe('borrador', () => {
  it('receta vacía: rinde 1 en la unidad del producto', () => {
    expect(recetaVacia('porción')).toMatchObject({ rinde: 1, unidadRinde: 'PORCIÓN', ingredientes: [] });
    expect(recetaVacia(' kg ').unidadRinde).toBe('KG');
  });
  it('un ingrediente nuevo arranca en su propia unidad, cantidad 1 y sin merma', () => {
    const i = ingredienteDesdeOpcion(carne);
    expect(i).toMatchObject({ ingredientProductId: 11, unidad: 'KG', unidadIngrediente: 'KG', cantidad: 1, mermaPct: 0, opcional: false });
  });
  it('copiar: claves nuevas y sin id ni versión (decisión 2, copia editable)', () => {
    const original: RecetaBorrador = { ...receta({}, {}), id: 5, version: 3 };
    const copia = copiarReceta(original);
    expect(copia.id).toBeUndefined();
    expect(copia.version).toBeUndefined();
    expect(copia.ingredientes.map((i) => i.ingredientProductId)).toEqual([10, 11]);
    expect(copia.ingredientes[0].clave).not.toBe(original.ingredientes[0].clave);
  });
});

describe('merma y margen', () => {
  it('merma sobre la cantidad neta: bruta = neta ÷ (1 − merma) (decisión 3)', () => {
    expect(cantidadBruta(90, 10)).toBeCloseTo(100);
    expect(cantidadBruta(150, 0)).toBe(150);
    expect(cantidadBruta(300, null)).toBe(300);
  });
  it('margen sobre el precio', () => {
    expect(margenReceta(6628, 24900)).toBeCloseTo(0.7338, 3);
    expect(margenReceta(null, 24900)).toBeNull();
    expect(margenReceta(100, 0)).toBeNull();
  });
});

describe('unidades del mismo tipo', () => {
  const unidades = [
    { code: 'GR', name: 'Gramo', unit_type: 'weight' },
    { code: 'KG', name: 'Kilogramo', unit_type: 'weight' },
    { code: 'UN', name: 'Unidad', unit_type: 'count' },
    { code: 'PAQ', name: 'Paquete', unit_type: 'count' },
  ];
  it('solo ofrece las del tipo de la unidad del ingrediente', () => {
    expect(unidadesCompatibles(unidades, 'KG').map((u) => u.code)).toEqual(['GR', 'KG']);
    expect(unidadesCompatibles(unidades, 'UN').map((u) => u.code)).toEqual(['UN', 'PAQ']);
  });
  it('sin tipo conocido no filtra', () => {
    expect(unidadesCompatibles(unidades, 'ZZ')).toHaveLength(4);
  });
});

describe('validación en línea', () => {
  it('cantidad > 0 y merma entre 0 y 99,99', () => {
    const b = receta({ cantidad: 0 }, { mermaPct: 100 });
    const v = validarReceta(b);
    expect(v.lineas[b.ingredientes[0].clave]).toBe('cantidad_invalida');
    expect(v.lineas[b.ingredientes[1].clave]).toBe('merma_invalida');
  });
  it('el mismo ingrediente y unidad repetido se marca y se puede fusionar', () => {
    const b = receta({ cantidad: 1 }, {}, {});
    b.ingredientes[2] = { ...ingredienteDesdeOpcion(pan), cantidad: 2 };
    expect([...duplicados(b)]).toEqual([b.ingredientes[2].clave]);
    expect(validarReceta(b).lineas[b.ingredientes[2].clave]).toBe('repetido');
    const f = fusionarDuplicado(b, b.ingredientes[2].clave);
    expect(f.ingredientes).toHaveLength(2);
    expect(f.ingredientes[0].cantidad).toBe(3);
  });
  it('el mismo ingrediente en otra unidad no es repetido', () => {
    const b = receta({}, {});
    b.ingredientes.push({ ...ingredienteDesdeOpcion(carne), unidad: 'GR' });
    expect(duplicados(b).size).toBe(0);
  });
  it('el propio producto o sus variantes no pueden ser ingrediente', () => {
    const b = receta({});
    expect(validarReceta(b, { excluirIds: [10] }).lineas[b.ingredientes[0].clave]).toBe('autorreferida');
  });
  it('rinde > 0 y al menos un ingrediente', () => {
    expect(validarReceta({ ...recetaVacia(), rinde: 0 }).general).toBe('rinde_invalido');
    expect(validarReceta(recetaVacia()).general).toBe('sin_ingredientes');
    expect(validarReceta(receta({})).general).toBeNull();
  });
});

describe('receta del formulario', () => {
  const base = (extra: Partial<RecetaForm> = {}): RecetaForm => ({ ...recetaFormInicial(), activa: true, compartida: receta({}, {}), ...extra });
  const ctx = { tieneVariantes: false, clavesVariantes: [], rastreaInventario: true, excluirIds: [] };

  it('apagada no valida nada', () => {
    expect(validarRecetaForm(recetaFormInicial(), ctx)).toBeNull();
  });
  it('encendida sin ingredientes', () => {
    expect(validarRecetaForm(base({ compartida: recetaVacia() }), ctx)).toBe('receta_sin_ingredientes');
  });
  it('con errores en una fila', () => {
    expect(validarRecetaForm(base({ compartida: receta({ cantidad: 0 }) }), ctx)).toBe('receta_con_errores');
  });
  it('«Al producir» exige rastrear inventario', () => {
    expect(validarRecetaForm(base({ modo: 'al_producir' }), { ...ctx, rastreaInventario: false })).toBe('receta_al_producir_sin_inventario');
    expect(validarRecetaForm(base({ modo: 'al_producir' }), ctx)).toBeNull();
  });
  it('por variante: una propia y otra que usa la compartida', () => {
    const r = base({ alcance: 'por_variante', porVariante: { v_2: receta({}, { cantidad: 300, unidad: 'GR', mermaPct: 10 }) } });
    expect(estadoVariante(r, 'v_1')).toBe('compartida');
    expect(estadoVariante(r, 'v_2')).toBe('propia');
    expect(estadoVariante({ ...r, porVariante: { v_2: receta({ cantidad: 0 }) } }, 'v_2')).toBe('con_errores');
    expect(estadoVariante({ ...r, compartida: null }, 'v_1')).toBe('sin_receta');
    const destinos = destinosReceta(r, true, ['v_1', 'v_2']);
    expect(destinos.map((d) => d.destino)).toEqual(['producto', { variante: 'v_2' }]);
  });
  it('con «Una receta para todas» las propias no se envían (el servidor las desactiva)', () => {
    const r = base({ alcance: 'compartida', porVariante: { v_2: receta({}) } });
    expect(destinosReceta(r, true, ['v_1', 'v_2']).map((d) => d.destino)).toEqual(['producto']);
  });
  it('recetas de variantes que ya no existen se descartan con aviso', () => {
    const r = base({ alcance: 'por_variante', porVariante: { v_1: receta({}), v_9: receta({}), v_8: receta({}) } });
    const { receta: limpia, quitadas } = limpiarRecetasHuerfanas(r, ['v_1', 'v_2']);
    expect(quitadas).toBe(2);
    expect(Object.keys(limpia.porVariante)).toEqual(['v_1']);
    expect(limpiarRecetasHuerfanas(limpia, ['v_1']).receta).toBe(limpia);
  });
});

describe('payload de fn_producto_guardar', () => {
  it('una receta compartida y una de variante nueva (sin id, por su clave)', () => {
    const r: RecetaForm = {
      activa: true,
      modo: 'al_vender',
      alcance: 'por_variante',
      compartida: receta({ cantidad: 1 }, { cantidad: 150, unidad: 'GR' }),
      porVariante: { v_2: receta({ cantidad: 1 }, { cantidad: 300, unidad: 'GR', mermaPct: 10, opcional: true, notas: ' extra ' }) },
    };
    const p = payloadRecetaProducto(r, true, ['v_1', 'v_2']);
    expect(p.activa).toBe(true);
    expect(p.modo).toBe('al_vender');
    expect(p.recetas).toHaveLength(2);
    expect(p.recetas[0]).toMatchObject({ destino: 'producto', yield_qty: 1, yield_unit_code: 'UN', name: null });
    expect(p.recetas[1].destino).toEqual({ variante: 'v_2' });
    expect(p.recetas[1].ingredientes[1]).toEqual({
      ingredient_product_id: 11, quantity: 300, unit_code: 'GR', waste_pct: 10, is_optional: true, notes: ' extra ',
    });
  });
  it('apagada: activa false y sin recetas (el servidor desactiva, no borra)', () => {
    expect(payloadRecetaProducto({ ...recetaFormInicial(), compartida: receta({}) }, false, [])).toEqual({ activa: false, modo: 'al_vender', recetas: [] });
  });
  it('rinde y unidad del rinde', () => {
    const b = { ...receta({ cantidad: 1200, unidad: 'GR' }), rinde: 12, unidadRinde: 'un', nombre: '  Salsa madre ' };
    expect(recetaAPayload(b)).toMatchObject({ yield_qty: 12, yield_unit_code: 'UN', name: 'Salsa madre' });
  });
});

describe('desde el servidor', () => {
  const datos: RecetasFormularioServidor = {
    recetas: [
      {
        recipe_id: 84, product_id: 902, name: null, yield_qty: 1, yield_unit_code: 'UN ', notes: null, version: 3, is_active: true,
        created_at: '2026-08-12T15:00:00Z',
        ingredientes: [{ ingredient_product_id: 11, quantity: 300, unit_code: 'GR ', waste_pct: 10, is_optional: false, notes: '[F-68: nota]' }],
      },
    ],
    productos: [{ id: 11, name: 'Carne molida', sku: 'CAR-010', unit_code: 'KG', track_stock: true }],
    ordenes_abiertas: 2,
  };
  it('receta de una variante con el padre sin marcar como compuesto: se activa por variante', () => {
    const r = recetaFormDesdeServidor(datos, {
      productId: 900, esCompuesto: false, alProducir: false, claveDeVariante: new Map([[902, 'v_doble']]), conId: true,
    });
    expect(r.activa).toBe(true);
    expect(r.alcance).toBe('por_variante');
    expect(r.compartida).toBeNull();
    expect(r.porVariante.v_doble).toMatchObject({ id: 84, version: 3, desde: '2026-08-12T15:00:00Z', unidadRinde: 'UN' });
    expect(r.porVariante.v_doble.ingredientes[0]).toMatchObject({
      ingredientProductId: 11, nombre: 'Carne molida', unidad: 'GR', unidadIngrediente: 'KG', mermaPct: 10, notas: '[F-68: nota]',
    });
  });
  it('duplicar: sin ids (se crea como receta nueva)', () => {
    const r = recetaFormDesdeServidor(datos, {
      productId: 900, esCompuesto: true, alProducir: true, claveDeVariante: new Map([[902, 'v_x']]), conId: false,
    });
    expect(r.modo).toBe('al_producir');
    expect(r.porVariante.v_x.id).toBeUndefined();
  });
  it('ida y vuelta: lo cargado vuelve al servidor igual (no crea versión sin cambios)', () => {
    const r = recetaFormDesdeServidor(datos, {
      productId: 900, esCompuesto: false, alProducir: false, claveDeVariante: new Map([[902, 'v_doble']]), conId: true,
    });
    const p = payloadRecetaProducto(r, true, ['v_doble']);
    expect(p.recetas[0].ingredientes[0]).toEqual({
      ingredient_product_id: 11, quantity: 300, unit_code: 'GR', waste_pct: 10, is_optional: false, notes: '[F-68: nota]',
    });
  });
  it('línea de costo por fila y detalle de conversión faltante', () => {
    const lineas = [{ orden: 2 } as LineaCostoReceta];
    expect(lineaDeFila(lineas, 1)).toBe(lineas[0]);
    expect(lineaDeFila(lineas, 0)).toBeUndefined();
    expect(detalleConversion('{"ingrediente_id": 11, "de": "GR", "a": "UN"}')).toEqual({ ingredienteId: 11, de: 'GR', a: 'UN' });
    expect(detalleConversion('no-json')).toBeNull();
  });
});
