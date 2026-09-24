jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

import {
  campoDeErrorRpc,
  construirPayload,
  estadoDesdeDatos,
  estadoInicial,
  erroresPorSeccion,
  primeraSeccionConError,
  rutaImagenProducto,
  validarFormulario,
  type EstadoFormularioProducto,
} from '../logica/formularioProducto';
import type { DatosFormularioProducto } from '@/lib/services/productoService';

function estadoValido(extra: Partial<EstadoFormularioProducto> = {}): EstadoFormularioProducto {
  return {
    ...estadoInicial([
      { branch_id: 10, nombre: 'Principal', principal: true },
      { branch_id: 11, nombre: 'Norte', principal: false },
    ]),
    sku: 'ZAP-0042',
    name: 'Zapatilla urbana',
    price: 189900,
    cost: 128000,
    ...extra,
  };
}

describe('validación del formulario', () => {
  it('un producto mínimo es válido', () => {
    expect(validarFormulario(estadoValido(), 'crear')).toEqual({});
  });
  it('marca cada campo con su código', () => {
    const e = estadoValido({ sku: ' ', name: 'Z', price: -1, cost: -2 });
    expect(validarFormulario(e, 'crear')).toMatchObject({
      sku: 'sku_requerido',
      name: 'nombre_corto',
      price: 'precio_negativo',
      cost: 'costo_negativo',
    });
    expect(validarFormulario(estadoValido({ compare_price: 100 }), 'crear').compare_price).toBe('comparacion_menor');
  });
  it('stock inicial sin costo no pasa (kardex), en editar no aplica', () => {
    const e = estadoValido({ cost: null });
    e.stock[0].qty = 5;
    expect(validarFormulario(e, 'crear').stock).toBe('stock_sin_costo');
    e.stock[0].unit_cost = 1000;
    expect(validarFormulario(e, 'crear').stock).toBeUndefined();
    const ed = estadoValido({ cost: null });
    ed.stock[0].qty = 5;
    expect(validarFormulario(ed, 'editar').stock).toBeUndefined();
  });
  it('seriales auto-generados exigen patrón con consecutivo', () => {
    const e = estadoValido({ track_serial: true, auto_generate_serial: true, serial_pattern: 'ZAP-{YYYY}' });
    expect(validarFormulario(e, 'crear').serial_pattern).toBe('patron_sin_consecutivo');
    expect(validarFormulario({ ...e, warranty_months: 1.5 }, 'crear').warranty_months).toBe('garantia_invalida');
  });
  it('variantes: al menos una, SKU únicos y sin combinaciones repetidas', () => {
    expect(validarFormulario(estadoValido({ tiene_variantes: true }), 'crear').variantes).toBe('sin_variantes');
    const base = {
      clave: 'a', sku: 'ZAP-40', barcode: '', name: 'Z (40)', attributes: { Talla: '40' },
      price: 1, compare_price: null, cost: 1, status: 'active' as const, stock: [],
    };
    expect(
      validarFormulario(estadoValido({ tiene_variantes: true, variantes: [base, { ...base, clave: 'b', sku: 'zap-40' }] }), 'crear').variantes,
    ).toBe('sku_variante_repetido');
    expect(
      validarFormulario(estadoValido({ tiene_variantes: true, variantes: [base, { ...base, clave: 'b', sku: 'ZAP-41' }] }), 'crear').variantes,
    ).toBe('combinacion_repetida');
    expect(
      validarFormulario(
        estadoValido({
          tiene_variantes: true,
          variantes: [{ ...base, cost: null, stock: [{ branch_id: 10, qty: 2, min_level: null, qty_actual: 0 }] }],
        }),
        'crear',
      ).variantes,
    ).toBe('variante_stock_sin_costo');
  });
  it('modificadores e imágenes', () => {
    const g = { clave: 'g', name: 'Salsas', selection_mode: 'multiple' as const, min_selections: 2, max_selections: 1, required: false, opciones: [] };
    expect(validarFormulario(estadoValido({ modificadores: [g] }), 'crear').modificadores).toBe('min_max_invalido');
    const imgs = Array.from({ length: 6 }, (_, i) => ({ clave: `i${i}`, vista: '', is_primary: i === 0, alt_text: '', origen: 'subida' as const }));
    expect(validarFormulario(estadoValido({ imagenes: imgs }), 'crear').imagenes).toBe('demasiadas_imagenes');
    expect(validarFormulario(estadoValido({ imagenes: imgs }), 'editar', { imagenesOriginales: 6 }).imagenes).toBeUndefined();
  });
  it('agrupa los errores por sección para el índice', () => {
    const err = validarFormulario(estadoValido({ sku: '', price: -1, cost: -1 }), 'crear');
    expect(erroresPorSeccion(err)).toEqual({ informacion: 1, precios: 2 });
    expect(primeraSeccionConError(err)).toBe('informacion');
    expect(campoDeErrorRpc('sku_duplicado')).toBe('sku');
    expect(campoDeErrorRpc('stock_sin_costo')).toBe('stock');
    expect(campoDeErrorRpc('desconocido')).toBeNull();
  });
});

describe('payload de fn_producto_guardar', () => {
  it('crear: stock inicial por kardex con el costo del producto y proveedor preferido completo', () => {
    const e = estadoValido({
      impuestos: ['t1', 't2'],
      etiquetas: [5],
      categorias_adicionales: [1, 2],
      category_id: 1,
      proveedor: { supplier_id: 9, cost: 120000, lead_time_days: 5, min_order_qty: 10, supplier_sku: ' DN-42 ', notes: '' },
    });
    e.stock[0].qty = 25;
    e.stock[0].min_level = 5;
    e.stock[1].qty = 0;
    const p = construirPayload(e, 'crear');
    expect(p.modo).toBe('crear');
    expect(p.product_id).toBeUndefined();
    expect(p.precio).toEqual({ price: 189900, compare_price: null, desde: null });
    expect(p.costo).toEqual({ cost: 128000, desde: null });
    expect(p.categorias_adicionales).toEqual([2]);
    expect(p.stock).toEqual([
      { branch_id: 10, qty: 25, unit_cost: 128000, min_level: 5 },
      { branch_id: 11, min_level: 0 },
    ]);
    expect(p.proveedores).toEqual([
      { supplier_id: 9, cost: 120000, lead_time_days: 5, min_order_qty: 10, supplier_sku: 'DN-42', notes: null, is_preferred: true },
    ]);
    expect(p.tiene_variantes).toBe(false);
    expect(p.variantes).toBeUndefined();
  });
  it('editar: no envía cantidades (el stock va por ajuste) y conserva ids', () => {
    const e = estadoValido({
      modificadores: [
        { clave: 'g', id: 7, name: 'Salsas', selection_mode: 'single', min_selections: 0, max_selections: 1, required: true,
          opciones: [{ clave: 'o', id: 3, name: 'BBQ', extra_price: 500, is_active: true }, { clave: 'o2', name: '  ', extra_price: 0, is_active: true }] },
      ],
      imagenes: [{ clave: 'i', id: 4, storage_path: 'products/1/a.png', vista: '', is_primary: true, alt_text: ' Frente ', origen: 'existente' }],
    });
    e.stock[0].qty = 99;
    e.stock[0].min_level = 3;
    const p = construirPayload(e, 'editar', { productId: 55 });
    expect(p.product_id).toBe(55);
    expect(p.stock?.[0]).toEqual({ branch_id: 10, min_level: 3 });
    expect(p.modificadores?.[0]).toMatchObject({ id: 7, opciones: [{ id: 3, name: 'BBQ', extra_price: 500, is_active: true }] });
    expect(p.imagenes).toEqual([{ id: 4, is_primary: true, alt_text: 'Frente', shared_image_id: null }]);
    expect(p.proveedores_quitar_preferido).toBe(true);
  });
  it('servicio: sin inventario, sin envío', () => {
    const e = estadoValido({ product_type: 'service', weight_kg: 2 });
    e.stock[0].qty = 3;
    const p = construirPayload(e, 'crear');
    expect(p.producto.track_stock).toBe(false);
    expect(p.producto.weight_kg).toBeNull();
    expect(p.stock).toBeUndefined();
  });
  it('variantes: nombre por defecto y stock solo para las nuevas', () => {
    const e = estadoValido({
      tiene_variantes: true,
      variantes: [
        { clave: 'a', id: 1, sku: 'Z-40', barcode: '', name: '', attributes: { Talla: '40' }, price: 1, compare_price: null, cost: 1, status: 'active',
          stock: [{ branch_id: 10, qty: 9, min_level: 2, qty_actual: 4 }] },
        { clave: 'b', sku: 'Z-41', barcode: '', name: 'Z (41)', attributes: { Talla: '41' }, price: 1, compare_price: null, cost: 1, status: 'active',
          stock: [{ branch_id: 10, qty: 3, min_level: null, qty_actual: 0 }] },
      ],
    });
    const p = construirPayload(e, 'editar', { productId: 1 });
    expect(p.variantes?.[0]).toMatchObject({ id: 1, name: 'Zapatilla urbana (40)', stock: [{ branch_id: 10, min_level: 2 }] });
    expect(p.variantes?.[1].stock).toEqual([{ branch_id: 10, qty: 3, min_level: 0 }]);
    expect(p.stock).toBeUndefined();
  });
});

describe('duplicar desde los datos del formulario', () => {
  const datos: DatosFormularioProducto = {
    producto: { id: 1, uuid: 'u', sku: 'ZAP', name: 'Zapatilla', status: 'active', track_stock: true, is_parent: true, barcode: '770', brand: 'Nova' },
    precio: { price: 100, compare_price: 120, desde: '' },
    precio_programado: null,
    costo: { cost: 60, supplier_id: 9, desde: '' },
    impuestos: ['t1'],
    categorias_adicionales: [3],
    categorias_por_regla: [],
    etiquetas: [5],
    proveedores: [
      { id: 1, supplier_id: 9, nombre: 'A', cost: 55, lead_time_days: 5, min_order_qty: 10, supplier_sku: 'X', notes: null, is_preferred: true },
      { id: 2, supplier_id: 8, nombre: 'B', cost: 57, lead_time_days: 2, min_order_qty: 1, supplier_sku: null, notes: 'n', is_preferred: false },
    ],
    stock: [{ branch_id: 10, nombre: 'P', principal: true, activa: true, qty_on_hand: 25, min_level: 5, avg_cost: 60 }],
    variantes: [
      { id: 2, sku: 'ZAP-40', barcode: '771', name: 'Zapatilla (40)', attributes: { Talla: '40' }, status: 'active', price: 100, compare_price: null, cost: 60,
        stock: [{ branch_id: 10, qty_on_hand: 4, min_level: 1 }] },
    ],
    modificadores: [{ id: 3, name: 'Extras', selection_mode: 'multiple', min_selections: 0, max_selections: null, required: false, display_order: 0,
      opciones: [{ id: 4, name: 'Plantilla', extra_price: 5, is_active: true, display_order: 0 }] }],
    imagenes: [{ id: 6, storage_path: 'products/1/a.png', is_primary: true, alt_text: null, display_order: 0, shared_image_id: null }],
  };
  const urlPublica = (r: string) => `https://cdn/${r}`;

  it('quita ids, marca las imágenes para copiarlas y deja el stock en 0', () => {
    const e = estadoDesdeDatos(datos, 'duplicar', { urlPublica });
    expect(e.sku).toBe('ZAP-COPY');
    expect(e.name).toBe('Zapatilla (Copia)');
    expect(e.barcode).toBe('');
    expect(e.variantes[0]).toMatchObject({ id: undefined, sku: 'ZAP-40-COPY', barcode: '' });
    expect(e.variantes[0].stock[0].qty_actual).toBe(0);
    expect(e.stock[0].qty_actual).toBe(0);
    expect(e.modificadores[0].id).toBeUndefined();
    expect(e.imagenes[0]).toMatchObject({ id: undefined, storage_path: undefined, copiar_de: 'products/1/a.png', origen: 'copia' });
    expect(e.proveedor.supplier_id).toBe(9);
    expect(e.otros_proveedores).toHaveLength(1);
    const p = construirPayload(e, 'duplicar', { rutas: { [e.imagenes[0].clave]: 'products/1/nueva.png' } });
    expect(p.imagenes).toEqual([{ storage_path: 'products/1/nueva.png', is_primary: true, alt_text: null, shared_image_id: null }]);
    expect(p.proveedores?.map((x) => x.supplier_id)).toEqual([9, 8]);
  });
  it('respeta «qué copiar»', () => {
    const e = estadoDesdeDatos(datos, 'duplicar', {
      urlPublica,
      copiar: { variantes: false, precios: false, costos: true, imagenes: false, etiquetas: false, impuestos: false, modificadores: false, proveedores: false, categorias: false },
    });
    expect(e.tiene_variantes).toBe(false);
    expect(e.price).toBeNull();
    expect(e.cost).toBe(60);
    expect(e.imagenes).toEqual([]);
    expect(e.etiquetas).toEqual([]);
    expect(e.impuestos).toEqual([]);
    expect(e.proveedor.supplier_id).toBeNull();
  });
  it('editar conserva ids y existencias', () => {
    const e = estadoDesdeDatos(datos, 'editar', { urlPublica });
    expect(e.sku).toBe('ZAP');
    expect(e.variantes[0].id).toBe(2);
    expect(e.stock[0]).toMatchObject({ qty_actual: 25, min_level: 5, qty: null });
    expect(e.imagenes[0]).toMatchObject({ id: 6, storage_path: 'products/1/a.png', vista: 'https://cdn/products/1/a.png' });
  });
  it('las imágenes de la biblioteca compartida conservan su ruta al duplicar', () => {
    const e = estadoDesdeDatos(
      { ...datos, imagenes: [{ id: 7, storage_path: 'shared/x.png', is_primary: true, alt_text: null, display_order: 0, shared_image_id: 9 }] },
      'duplicar',
      { urlPublica },
    );
    expect(e.imagenes[0]).toMatchObject({ storage_path: 'shared/x.png', copiar_de: undefined, origen: 'biblioteca', shared_image_id: 9 });
    expect(construirPayload(e, 'duplicar').imagenes).toEqual([{ storage_path: 'shared/x.png', is_primary: true, alt_text: null, shared_image_id: 9 }]);
  });
  it('ruta de imagen nueva en el bucket', () => {
    expect(rutaImagenProducto(144, 'Foto.PNG', 'abc')).toBe('products/144/abc.png');
    expect(rutaImagenProducto(1, 'sin-extension', 'z')).toBe('products/1/z.sinextension');
  });
});

