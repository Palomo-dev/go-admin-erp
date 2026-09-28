/**
 * Receta dentro del formulario de producto: estado, validación, payload de
 * fn_producto_guardar (receta nueva y de variante nueva, idempotencia),
 * borrador local y mapeo de recetas guardadas a las claves de variante.
 */
const rpc = jest.fn();
const upload = jest.fn();
const remove = jest.fn();
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    storage: { from: () => ({ upload: (...a: unknown[]) => upload(...a), remove: (...a: unknown[]) => remove(...a) }) },
  },
}));
jest.mock('@/lib/supabase/imageUtils', () => ({ getBucketName: () => 'product-images', getPublicUrl: (r: string) => r }));
jest.mock('@/lib/services/codigosBarrasService', () => ({ generarCodigosFaltantes: jest.fn() }));
jest.mock('@/lib/services/website/avisarCambioCatalogo', () => ({ avisarCambioCatalogo: jest.fn() }));

import { ingredienteDesdeOpcion, recetaVacia, type RecetaBorrador } from '@/components/kit/receta/recetaLogica';
import type { DatosFormularioProducto } from '@/lib/services/productoService';
import {
  campoDeErrorRpc,
  construirPayload,
  estadoDesdeDatos,
  estadoInicial,
  idsPropios,
  primeraSeccionConError,
  validarFormulario,
  type EstadoFormularioProducto,
  type VarianteForm,
} from '../logica/formularioProducto';
import { PASO_DE_CAMPO } from '../formulario/mapaSecciones';
import { guardarProducto } from '../formulario/guardarProducto';
import { claveBorrador, conRecetas, leerBorrador, nuevaClaveIdempotencia, serializarBorrador } from '../formulario/useProductoForm';

const pan = { id: 10, nombre: 'Pan brioche', sku: 'PAN-004', unidad: 'UN', trackStock: true };
const carne = { id: 11, nombre: 'Carne molida', sku: 'CAR-010', unidad: 'KG', trackStock: true };

function recetaCon(cantidadCarneGr: number, merma = 0): RecetaBorrador {
  return {
    ...recetaVacia('UN'),
    ingredientes: [
      ingredienteDesdeOpcion(pan),
      { ...ingredienteDesdeOpcion(carne), cantidad: cantidadCarneGr, unidad: 'GR', mermaPct: merma },
    ],
  };
}

function variante(clave: string, sku: string, name: string, id?: number): VarianteForm {
  return { clave, id, sku, barcode: '', name, attributes: { Tamaño: name }, price: null, compare_price: null, cost: null, status: 'active', stock: [] };
}

function hamburguesa(extra: Partial<EstadoFormularioProducto> = {}): EstadoFormularioProducto {
  return {
    ...estadoInicial([{ branch_id: 1, nombre: 'Principal', principal: true }]),
    sku: 'HAM-001',
    name: 'Hamburguesa de la casa',
    price: 24900,
    track_stock: false,
    ...extra,
  };
}

describe('validación de la receta en el formulario', () => {
  it('el error de receta vive en «Avanzado» y en el paso «Más detalles» del móvil', () => {
    const e = hamburguesa({ receta: { activa: true, modo: 'al_vender', alcance: 'compartida', compartida: recetaVacia(), porVariante: {} } });
    const err = validarFormulario(e, 'crear');
    expect(err.receta).toBe('receta_sin_ingredientes');
    expect(primeraSeccionConError(err)).toBe('avanzado');
    expect(PASO_DE_CAMPO.receta).toBe('detalles');
  });
  it('«Al producir» sin rastrear inventario no pasa', () => {
    const e = hamburguesa({ receta: { activa: true, modo: 'al_producir', alcance: 'compartida', compartida: recetaCon(150), porVariante: {} } });
    expect(validarFormulario(e, 'crear').receta).toBe('receta_al_producir_sin_inventario');
    expect(validarFormulario({ ...e, track_stock: true }, 'crear').receta).toBeUndefined();
  });
  it('en editar el propio producto y sus variantes no pueden ser ingredientes', () => {
    const e = hamburguesa({
      tiene_variantes: true,
      variantes: [variante('v_1', 'HAM-S', 'Sencilla', 11)],
      receta: { activa: true, modo: 'al_vender', alcance: 'compartida', compartida: recetaCon(150), porVariante: {} },
    });
    expect(idsPropios(e, 900)).toEqual([900, 11]);
    expect(validarFormulario(e, 'editar', { productId: 900 }).receta).toBe('receta_con_errores');
  });
  it('los errores de receta del servidor llevan al campo «receta»', () => {
    for (const c of ['conversion_faltante', 'receta_autorreferida', 'receta_ingrediente_repetido', 'receta_al_producir_sin_inventario'] as const) {
      expect(campoDeErrorRpc(c)).toBe('receta');
    }
  });
});

describe('payload: receta nueva y variante nueva en un solo guardado', () => {
  const e = hamburguesa({
    tiene_variantes: true,
    variantes: [variante('v_1', 'HAM-S', 'Sencilla'), variante('v_2', 'HAM-D', 'Doble')],
    receta: {
      activa: true,
      modo: 'al_vender',
      alcance: 'por_variante',
      compartida: recetaCon(150),
      porVariante: { v_2: recetaCon(300, 10) },
    },
  });

  it('cada variante viaja con su clave y la receta apunta a esa clave', () => {
    const p = construirPayload(e, 'crear');
    expect(p.producto.is_composite).toBe(true);
    expect(p.variantes?.map((v) => v.clave)).toEqual(['v_1', 'v_2']);
    expect(p.receta?.recetas.map((r) => r.destino)).toEqual(['producto', { variante: 'v_2' }]);
    expect(p.receta?.recetas[1].ingredientes[1]).toMatchObject({ ingredient_product_id: 11, quantity: 300, unit_code: 'GR', waste_pct: 10 });
  });
  it('sin variantes, las recetas propias que quedaron no se envían', () => {
    const p = construirPayload({ ...e, tiene_variantes: false }, 'crear');
    expect(p.variantes).toBeUndefined();
    expect(p.receta?.recetas.map((r) => r.destino)).toEqual(['producto']);
  });
  it('apagar la receta envía activa=false (el servidor desactiva, no borra)', () => {
    const p = construirPayload({ ...e, receta: { ...e.receta, activa: false } }, 'editar', { productId: 900 });
    expect(p.producto.is_composite).toBe(false);
    expect(p.receta).toEqual({ activa: false, modo: 'al_vender', recetas: [] });
  });

  it('guardarProducto manda la clave de idempotencia y un reintento no deja imágenes huérfanas', async () => {
    rpc.mockReset();
    upload.mockReset().mockResolvedValue({ error: null });
    remove.mockReset().mockResolvedValue({ error: null });
    rpc.mockResolvedValue({
      data: {
        id: 900, uuid: 'u', sku: 'HAM-001', name: 'Hamburguesa de la casa', price: 24900, cost: 0,
        variantes: [{ id: 901, sku: 'HAM-S', clave: 'v_1' }, { id: 902, sku: 'HAM-D', clave: 'v_2' }],
        imagenes_quitadas: [],
        recetas: [{ destino: { variante: 'v_2' }, product_id: 902, recipe_id: 84, version: 1, cambio: true }],
        repetido: true,
      },
      error: null,
    });
    const archivo = { name: 'foto.png', type: 'image/png' } as File;
    const conFoto = { ...e, imagenes: [{ clave: 'i1', file: archivo, vista: 'blob:x', is_primary: true, alt_text: '', origen: 'subida' as const }] };
    const r = await guardarProducto({
      organizacionId: 134,
      estado: conFoto,
      modo: 'crear',
      revisarCodigos: async () => null,
      claveIdempotencia: '3f0c5a52-3c61-4b7d-9d7e-6a0000000001',
    });
    expect(r.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('fn_producto_guardar', expect.objectContaining({ p_organization_id: 134 }));
    const payload = rpc.mock.calls[0][1].p_payload;
    expect(payload.clave_idempotencia).toBe('3f0c5a52-3c61-4b7d-9d7e-6a0000000001');
    expect(payload.receta.recetas).toHaveLength(2);
    // El resultado es el de la primera vez: la foto recién subida no quedó referenciada.
    expect(remove).toHaveBeenCalledWith([expect.stringMatching(/^products\/134\/.+\.png$/)]);
    if (r.ok) expect(r.resultado.recetas?.[0].recipe_id).toBe(84);
  });
});

describe('editar y duplicar con recetas guardadas', () => {
  const datos = {
    producto: { id: 900, uuid: 'u', sku: 'HAM-001', name: 'Hamburguesa', status: 'active', is_composite: false, production_type: 'simple', is_parent: true },
    precio: null, precio_programado: null, costo: null, impuestos: [], categorias_adicionales: [], categorias_por_regla: [], etiquetas: [],
    proveedores: [], stock: [], modificadores: [], imagenes: [],
    variantes: [
      { id: 901, sku: 'HAM-S', barcode: null, name: 'Sencilla', attributes: {}, status: 'active', price: null, compare_price: null, cost: null, stock: [] },
      { id: 902, sku: 'HAM-D', barcode: null, name: 'Doble', attributes: {}, status: 'active', price: null, compare_price: null, cost: null, stock: [] },
    ],
  } as unknown as DatosFormularioProducto;
  const recetas = {
    recetas: [{
      recipe_id: 84, product_id: 902, name: null, yield_qty: 1, yield_unit_code: null, notes: null, version: 2, is_active: true, created_at: null,
      ingredientes: [{ ingredient_product_id: 11, quantity: 300, unit_code: 'GR', waste_pct: 0, is_optional: false, notes: null }],
    }],
    productos: [{ id: 11, name: 'Carne molida', sku: 'CAR-010', unit_code: 'KG', track_stock: true }],
    ordenes_abiertas: 0,
  };
  it('editar: la receta de la variante 902 queda en la clave de esa variante, con su id', () => {
    const e = conRecetas(estadoDesdeDatos(datos, 'editar', { urlPublica: (x) => x }), datos, recetas, true);
    const doble = e.variantes.find((v) => v.id === 902)!;
    expect(e.receta.activa).toBe(true);
    expect(e.receta.porVariante[doble.clave]).toMatchObject({ id: 84, version: 2 });
    const p = construirPayload(e, 'editar', { productId: 900 });
    expect(p.receta?.recetas[0].destino).toEqual({ variante: doble.clave });
    expect(p.variantes?.find((v) => v.id === 902)?.clave).toBe(doble.clave);
  });
  it('duplicar: la misma receta, sin id, para la variante copiada', () => {
    const e = conRecetas(estadoDesdeDatos(datos, 'duplicar', { urlPublica: (x) => x }), datos, recetas, false);
    const receta = Object.values(e.receta.porVariante)[0];
    expect(receta.id).toBeUndefined();
    expect(e.variantes[1].id).toBeUndefined();
    expect(Object.keys(e.receta.porVariante)).toEqual([e.variantes[1].clave]);
  });
});

describe('borrador local e idempotencia', () => {
  it('la clave separa organización, modo y producto', () => {
    expect(claveBorrador(134, 'crear')).toBe('producto-borrador:134:crear:nuevo');
    expect(claveBorrador(134, 'editar', 'abc')).toBe('producto-borrador:134:editar:abc');
  });
  it('se guarda sin los archivos por subir y se recupera la receta', () => {
    const e = hamburguesa({
      receta: { activa: true, modo: 'al_vender', alcance: 'compartida', compartida: recetaCon(150), porVariante: {} },
      imagenes: [
        { clave: 'a', file: {} as File, vista: 'blob:x', is_primary: true, alt_text: '', origen: 'subida' },
        { clave: 'b', storage_path: 'products/1/b.png', vista: 'b', is_primary: false, alt_text: '', origen: 'existente', id: 3 },
      ],
    });
    const r = leerBorrador(serializarBorrador(e));
    expect(r?.imagenes.map((i) => i.clave)).toEqual(['b']);
    expect(r?.receta.compartida?.ingredientes).toHaveLength(2);
    expect(leerBorrador('{"x":1}')).toBeNull();
    expect(leerBorrador('no-json')).toBeNull();
    expect(leerBorrador(null)).toBeNull();
  });
  it('la clave de idempotencia es un uuid', () => {
    expect(nuevaClaveIdempotencia()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
