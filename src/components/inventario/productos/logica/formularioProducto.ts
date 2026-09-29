import type {
  CodigoErrorProducto,
  DatosFormularioProducto,
  ModoFormularioProducto,
  PayloadGuardarProducto,
  ProductoCampos,
} from '@/lib/services/productoService';
import {
  payloadRecetaProducto,
  recetaFormInicial,
  validarRecetaForm,
  type RecetaForm,
} from '@/components/kit/receta/recetaLogica';
import {
  esTipoServicio,
  membresiaDesdeServidor,
  membresiaFormInicial,
  payloadMembresia,
  validarMembresia,
  type CampoMembresia,
  type CodigoValidacionMembresia,
  type MembresiaForm,
  type TipoServicio,
} from './membresiaProducto';
import { validarPatron } from './seriales';
import { claveAtributos, nombreVariante, type Atributos } from './variantes';
import {
  decimalesCantidad,
  modoVenta,
  redondearCantidadProducto,
  UNIDADES_MEDIDA,
  UNIDADES_PESO,
  type ModoVenta,
} from '@/lib/pos/peso/modoVenta';
import { referenciaValida, type ReferenciaPrecio } from '@/lib/pos/peso/precioReferencia';

/**
 * Estado, validación y payload del formulario único de producto
 * (nuevo · editar · duplicar). Sin React: lo prueban los tests y lo usan las
 * secciones del formulario. El guardado es una sola RPC (`fn_producto_guardar`).
 */

// ── Tipos ──────────────────────────────────────────────────────────────────

export type SeccionFormulario =
  | 'informacion'
  | 'precios'
  | 'impuestos'
  | 'membresia'
  | 'inventario'
  | 'variantes'
  | 'modificadores'
  | 'imagenes'
  | 'codigos'
  | 'organizacion'
  | 'avanzado';

export const SECCIONES_FORMULARIO: readonly SeccionFormulario[] = [
  'informacion',
  'precios',
  'impuestos',
  'membresia',
  'inventario',
  'variantes',
  'modificadores',
  'imagenes',
  'codigos',
  'organizacion',
  'avanzado',
];

export type CampoFormulario =
  | 'sku'
  | 'name'
  | 'category_id'
  | 'price'
  | 'compare_price'
  | 'cost'
  | 'precio_desde'
  | 'impuestos'
  | 'stock'
  | 'serial_pattern'
  | 'warranty_months'
  | 'variantes'
  | 'modificadores'
  | 'imagenes'
  | 'barcode'
  | 'proveedor'
  | 'dimensiones'
  | 'receta'
  | 'service_type'
  | 'modo_venta'
  | CampoMembresia;

/** Sección donde vive cada campo (índice lateral y paso del stepper móvil). */
export const SECCION_DE_CAMPO: Record<CampoFormulario, SeccionFormulario> = {
  sku: 'informacion',
  name: 'informacion',
  category_id: 'informacion',
  price: 'precios',
  compare_price: 'precios',
  cost: 'precios',
  precio_desde: 'precios',
  impuestos: 'impuestos',
  stock: 'inventario',
  serial_pattern: 'inventario',
  warranty_months: 'inventario',
  variantes: 'variantes',
  modificadores: 'modificadores',
  imagenes: 'imagenes',
  barcode: 'codigos',
  proveedor: 'organizacion',
  dimensiones: 'avanzado',
  receta: 'avanzado',
  service_type: 'informacion',
  modo_venta: 'precios',
  membresia_duracion: 'membresia',
  membresia_cobro: 'membresia',
  membresia_gracia: 'membresia',
  membresia_activacion: 'membresia',
  membresia_congelamiento: 'membresia',
  membresia_sedes: 'membresia',
  membresia_horario: 'membresia',
  membresia_entradas: 'membresia',
};

/** Códigos de validación: son claves i18n en `productoForm.errores.*`. */
export type CodigoValidacion =
  | 'sku_requerido'
  | 'sku_duplicado'
  | 'nombre_corto'
  | 'precio_negativo'
  | 'comparacion_menor'
  | 'costo_negativo'
  | 'vigencia_pasada'
  | 'stock_sin_costo'
  | 'cantidad_negativa'
  | 'patron_requerido'
  | 'patron_sin_consecutivo'
  | 'garantia_invalida'
  | 'sin_variantes'
  | 'variante_incompleta'
  | 'sku_variante_repetido'
  | 'combinacion_repetida'
  | 'variante_stock_sin_costo'
  | 'grupo_sin_nombre'
  | 'min_max_invalido'
  | 'opcion_sin_nombre'
  | 'demasiadas_imagenes'
  | 'dimension_negativa'
  | 'categoria_invalida'
  | 'impuesto_invalido'
  | 'proveedor_invalido'
  | 'variantes_activas'
  | 'receta_sin_ingredientes'
  | 'receta_con_errores'
  | 'receta_al_producir_sin_inventario'
  | 'membresia_con_variantes'
  | 'modo_venta_servicio'
  | 'modo_venta_con_variantes'
  | 'unidad_peso_invalida'
  | 'unidad_medida_invalida'
  | 'referencia_precio_invalida'
  | 'minimo_invalido'
  | CodigoValidacionMembresia;

export type ErroresFormulario = Partial<Record<CampoFormulario, CodigoValidacion>>;

export interface FilaStockForm {
  branch_id: number;
  nombre: string;
  principal: boolean;
  /** Cantidad inicial (crear/duplicar). En editar no se envía. */
  qty: number | null;
  min_level: number | null;
  /** Costo unitario de la entrada; vacío = costo del producto. */
  unit_cost: number | null;
  /** Existencia actual (solo lectura en editar). */
  qty_actual: number;
}

export interface StockVarianteForm {
  branch_id: number;
  qty: number | null;
  min_level: number | null;
  qty_actual: number;
}

export interface VarianteForm {
  clave: string;
  id?: number;
  sku: string;
  barcode: string;
  name: string;
  attributes: Atributos;
  price: number | null;
  compare_price: number | null;
  cost: number | null;
  status: 'active' | 'inactive' | 'discontinued';
  stock: StockVarianteForm[];
}

export interface OpcionModificadorForm {
  clave: string;
  id?: number;
  name: string;
  extra_price: number | null;
  is_active: boolean;
}

export interface GrupoModificadorForm {
  clave: string;
  id?: number;
  name: string;
  selection_mode: 'single' | 'multiple';
  min_selections: number;
  max_selections: number | null;
  required: boolean;
  opciones: OpcionModificadorForm[];
}

export type OrigenImagen = 'existente' | 'subida' | 'ia' | 'biblioteca' | 'copia';

export interface ImagenForm {
  clave: string;
  id?: number;
  /** Ruta en storage (existente, IA, biblioteca o copia ya hecha). */
  storage_path?: string;
  /** Archivo por subir (origen «subida»). */
  file?: File;
  /** URL para la miniatura (pública u object URL). */
  vista: string;
  is_primary: boolean;
  alt_text: string;
  shared_image_id?: number | null;
  origen: OrigenImagen;
  /** Duplicar: ruta de origen que hay que copiar a una ruta nueva antes de guardar. */
  copiar_de?: string;
}

export interface ProveedorForm {
  supplier_id: number | null;
  cost: number | null;
  lead_time_days: number | null;
  min_order_qty: number | null;
  supplier_sku: string;
  notes: string;
}

export interface EstadoFormularioProducto {
  // Información
  sku: string;
  name: string;
  product_type: 'product' | 'service';
  /** «¿Qué tipo de servicio es?» (products.service_type); solo cuenta si es servicio. */
  service_type: TipoServicio;
  status: 'active' | 'inactive' | 'discontinued';
  category_id: number | null;
  categorias_adicionales: number[];
  description: string;
  // Precios y costos
  price: number | null;
  compare_price: number | null;
  cost: number | null;
  /** Instante ISO de la vigencia programada; null = ahora. */
  precio_desde: string | null;
  // Impuestos
  impuestos: string[];
  // Inventario y trazabilidad
  track_stock: boolean;
  stock: FilaStockForm[];
  track_serial: boolean;
  auto_generate_serial: boolean;
  serial_pattern: string;
  warranty_months: number | null;
  // Variantes
  tiene_variantes: boolean;
  variantes: VarianteForm[];
  // Modificadores
  modificadores: GrupoModificadorForm[];
  // Imágenes
  imagenes: ImagenForm[];
  // Códigos
  barcode: string;
  // Organización y proveedor
  brand: string;
  reference: string;
  unit_code: string;
  /**
   * Cómo se vende (PRODUCTOS-POR-PESO-BASCULA.md §2.1): por unidad, por peso
   * (kg o lb) o por medida (metro o litro). `price` y `cost` son SIEMPRE por
   * `unit_code` (por kg); «cada 100 g» es solo cómo se escribe el precio.
   */
  sale_mode: ModoVenta;
  /** Referencia del precio escrito: '' (por la unidad de venta) o «500GR», «250GR», «100GR», «50GR». */
  precio_referencia: string;
  /** Venta mínima de una línea, en `unit_code`. */
  min_sale_qty: number | null;
  /** «Exigir báscula»: nunca se vende con el peso escrito a mano. */
  require_scale: boolean;
  station: string | null;
  proveedor: ProveedorForm;
  /** Otros proveedores del producto (editar/duplicar): se conservan tal cual. */
  otros_proveedores: {
    supplier_id: number;
    cost: number | null;
    lead_time_days: number | null;
    min_order_qty: number | null;
    supplier_sku: string | null;
    notes: string | null;
  }[];
  etiquetas: number[];
  // Avanzado
  weight_kg: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  nota: string;
  /**
   * Receta (Avanzado › Receta). `receta.activa` es `products.is_composite`; la
   * receta de una variante se indexa por `VarianteForm.clave` hasta que la
   * variante exista (docs/design/PRODUCTO-RECETAS-Y-SUBSECCIONES.md §2.2).
   */
  receta: RecetaForm;
  /** «Configuración de membresía»: solo se envía si es servicio de tipo membresía. */
  membresia: MembresiaForm;
}

export interface SucursalBasica {
  branch_id: number;
  nombre: string;
  principal: boolean;
}

/** Qué se copia al duplicar (las 6 opciones de antes + las que se perdían). */
export interface OpcionesDuplicar {
  variantes: boolean;
  precios: boolean;
  costos: boolean;
  imagenes: boolean;
  etiquetas: boolean;
  impuestos: boolean;
  modificadores: boolean;
  proveedores: boolean;
  categorias: boolean;
}

export const DUPLICAR_TODO: OpcionesDuplicar = {
  variantes: true,
  precios: true,
  costos: true,
  imagenes: true,
  etiquetas: true,
  impuestos: true,
  modificadores: true,
  proveedores: true,
  categorias: true,
};

export const PROVEEDOR_VACIO: ProveedorForm = {
  supplier_id: null,
  cost: null,
  lead_time_days: null,
  min_order_qty: null,
  supplier_sku: '',
  notes: '',
};

/** Límite de imágenes (el de antes en «Nuevo»); en editar se respeta lo que ya hay. */
export const MAX_IMAGENES = 5;

let contador = 0;
/** Clave local para listas del formulario (no es un id de BD). */
export function nuevaClave(prefijo = 'k'): string {
  contador += 1;
  return `${prefijo}${Date.now().toString(36)}${contador}`;
}

// ── Construcción del estado ────────────────────────────────────────────────

export function filasStockIniciales(sucursales: readonly SucursalBasica[]): FilaStockForm[] {
  return sucursales.map((s) => ({
    branch_id: s.branch_id,
    nombre: s.nombre,
    principal: s.principal,
    qty: null,
    min_level: null,
    unit_cost: null,
    qty_actual: 0,
  }));
}

export function estadoInicial(sucursales: readonly SucursalBasica[] = []): EstadoFormularioProducto {
  return {
    sku: '',
    name: '',
    product_type: 'product',
    service_type: 'standard',
    status: 'active',
    category_id: null,
    categorias_adicionales: [],
    description: '',
    price: null,
    compare_price: null,
    cost: null,
    precio_desde: null,
    impuestos: [],
    track_stock: true,
    stock: filasStockIniciales(sucursales),
    track_serial: false,
    auto_generate_serial: false,
    serial_pattern: '',
    warranty_months: null,
    tiene_variantes: false,
    variantes: [],
    modificadores: [],
    imagenes: [],
    barcode: '',
    brand: '',
    reference: '',
    unit_code: 'UN',
    sale_mode: 'unit',
    precio_referencia: '',
    min_sale_qty: null,
    require_scale: false,
    station: null,
    proveedor: { ...PROVEEDOR_VACIO },
    otros_proveedores: [],
    etiquetas: [],
    weight_kg: null,
    length_cm: null,
    width_cm: null,
    height_cm: null,
    nota: '',
    receta: recetaFormInicial(),
    membresia: membresiaFormInicial(),
  };
}

const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/**
 * Estado a partir de `fn_producto_para_formulario`. En `duplicar` se quitan
 * los ids, el SKU pasa a «-COPY», el nombre a «(Copia)», el stock arranca en 0
 * y las imágenes se marcan para copiarse a una ruta nueva (nunca se reutiliza
 * el storage_path del original).
 */
export function estadoDesdeDatos(
  datos: DatosFormularioProducto,
  modo: ModoFormularioProducto,
  opciones: {
    urlPublica: (ruta: string) => string;
    copiar?: OpcionesDuplicar;
    sufijos?: { sku: string; nombre: string };
  },
): EstadoFormularioProducto {
  const p = datos.producto as Record<string, unknown>;
  const dup = modo === 'duplicar';
  const copiar = opciones.copiar ?? DUPLICAR_TODO;
  const sufijos = opciones.sufijos ?? { sku: '-COPY', nombre: ' (Copia)' };
  const preferido = datos.proveedores.find((x) => x.is_preferred) ?? null;

  const estado: EstadoFormularioProducto = {
    ...estadoInicial([]),
    sku: dup ? `${s(p.sku)}${sufijos.sku}` : s(p.sku),
    name: dup ? `${s(p.name)}${sufijos.nombre}` : s(p.name),
    product_type: p.product_type === 'service' ? 'service' : 'product',
    service_type: esTipoServicio(p.service_type) ? p.service_type : 'standard',
    status: (['active', 'inactive', 'discontinued'].includes(s(p.status)) ? s(p.status) : 'active') as EstadoFormularioProducto['status'],
    category_id: n(p.category_id),
    categorias_adicionales: dup && !copiar.categorias ? [] : [...datos.categorias_adicionales],
    description: s(p.description),
    price: dup && !copiar.precios ? null : datos.precio ? Number(datos.precio.price) : null,
    compare_price: dup && !copiar.precios ? null : datos.precio?.compare_price != null ? Number(datos.precio.compare_price) : null,
    cost: dup && !copiar.costos ? null : datos.costo ? Number(datos.costo.cost) : null,
    precio_desde: null,
    impuestos: dup && !copiar.impuestos ? [] : [...datos.impuestos],
    track_stock: p.track_stock !== false,
    stock: datos.stock.map((f) => ({
      branch_id: f.branch_id,
      nombre: f.nombre,
      principal: f.principal,
      qty: null,
      min_level: f.min_level ? Number(f.min_level) : null,
      unit_cost: null,
      qty_actual: dup ? 0 : Number(f.qty_on_hand) || 0,
    })),
    track_serial: Boolean(p.track_serial),
    auto_generate_serial: Boolean(p.auto_generate_serial),
    serial_pattern: s(p.serial_pattern),
    warranty_months: n(p.warranty_months),
    tiene_variantes: (dup ? copiar.variantes : true) && (Boolean(p.is_parent) || datos.variantes.length > 0),
    variantes:
      dup && !copiar.variantes
        ? []
        : datos.variantes.map((v) => ({
            clave: nuevaClave('v'),
            id: dup ? undefined : v.id,
            sku: dup ? `${v.sku}${sufijos.sku}` : v.sku,
            barcode: dup ? '' : s(v.barcode),
            name: v.name,
            attributes: { ...(v.attributes ?? {}) },
            price: dup && !copiar.precios ? null : n(v.price),
            compare_price: dup && !copiar.precios ? null : n(v.compare_price),
            cost: dup && !copiar.costos ? null : n(v.cost),
            status: (['active', 'inactive', 'discontinued'].includes(v.status) ? v.status : 'active') as VarianteForm['status'],
            stock: v.stock.map((st) => ({
              branch_id: st.branch_id,
              qty: null,
              min_level: st.min_level ? Number(st.min_level) : null,
              qty_actual: dup ? 0 : Number(st.qty_on_hand) || 0,
            })),
          })),
    modificadores:
      dup && !copiar.modificadores
        ? []
        : datos.modificadores.map((g) => ({
            clave: nuevaClave('g'),
            id: dup ? undefined : g.id,
            name: g.name,
            selection_mode: g.selection_mode === 'single' ? 'single' : 'multiple',
            min_selections: Number(g.min_selections) || 0,
            max_selections: n(g.max_selections),
            required: Boolean(g.required),
            opciones: g.opciones.map((o) => ({
              clave: nuevaClave('o'),
              id: dup ? undefined : o.id,
              name: o.name,
              extra_price: n(o.extra_price),
              is_active: o.is_active !== false,
            })),
          })),
    imagenes:
      dup && !copiar.imagenes
        ? []
        : datos.imagenes.map((i) => ({
            clave: nuevaClave('i'),
            id: dup ? undefined : i.id,
            // Duplicar: las propias se copian a una ruta nueva; las de la biblioteca
            // compartida se enlazan con su misma ruta (no son del producto).
            storage_path: dup && !i.shared_image_id ? undefined : i.storage_path,
            copiar_de: dup && !i.shared_image_id ? i.storage_path : undefined,
            vista: opciones.urlPublica(i.storage_path),
            is_primary: i.is_primary,
            alt_text: s(i.alt_text),
            shared_image_id: i.shared_image_id,
            origen: dup ? (i.shared_image_id ? 'biblioteca' : 'copia') : 'existente',
          })),
    barcode: dup ? '' : s(p.barcode),
    brand: s(p.brand),
    reference: s(p.reference),
    unit_code: s(p.unit_code).trim() || 'UN',
    sale_mode: modoVenta(p as { sale_mode?: string | null }),
    precio_referencia: referenciaComoTexto(p as { price_ref_qty?: unknown; price_ref_unit_code?: unknown }),
    min_sale_qty: n((p as { min_sale_qty?: unknown }).min_sale_qty),
    require_scale: (p as { require_scale?: unknown }).require_scale === true,
    station: p.station ? s(p.station) : null,
    proveedor:
      preferido && (!dup || copiar.proveedores)
        ? {
            supplier_id: preferido.supplier_id,
            cost: n(preferido.cost),
            lead_time_days: n(preferido.lead_time_days),
            min_order_qty: n(preferido.min_order_qty),
            supplier_sku: s(preferido.supplier_sku),
            notes: s(preferido.notes),
          }
        : { ...PROVEEDOR_VACIO },
    otros_proveedores:
      dup && !copiar.proveedores
        ? []
        : datos.proveedores
            .filter((x) => !x.is_preferred)
            .map((x) => ({
              supplier_id: x.supplier_id,
              cost: n(x.cost),
              lead_time_days: n(x.lead_time_days),
              min_order_qty: n(x.min_order_qty),
              supplier_sku: x.supplier_sku,
              notes: x.notes,
            })),
    etiquetas: dup && !copiar.etiquetas ? [] : [...datos.etiquetas],
    weight_kg: n(p.weight_kg),
    length_cm: n(p.length_cm),
    width_cm: n(p.width_cm),
    height_cm: n(p.height_cm),
    nota: '',
    // Las recetas llegan aparte (fn_producto_recetas_para_formulario): ver recetaFormDesdeServidor.
    receta: { ...recetaFormInicial(), activa: Boolean(p.is_composite), modo: p.production_type === 'preparation' ? 'al_producir' : 'al_vender' },
    // El plan viaja con el producto (también al duplicar: la copia es otro plan con las mismas reglas).
    membresia: membresiaDesdeServidor(datos.membresia),
  };
  // Duplicar con imágenes y sin principal marcada: la primera.
  if (estado.imagenes.length > 0 && !estado.imagenes.some((i) => i.is_primary)) {
    estado.imagenes = estado.imagenes.map((i, idx) => ({ ...i, is_primary: idx === 0 }));
  }
  return estado;
}

// ── Validación ─────────────────────────────────────────────────────────────

export function limiteImagenes(modo: ModoFormularioProducto, originales: number): number {
  return modo === 'editar' ? Math.max(MAX_IMAGENES, originales) : MAX_IMAGENES;
}

export function validarFormulario(
  e: EstadoFormularioProducto,
  modo: ModoFormularioProducto,
  contexto: { imagenesOriginales?: number; ahora?: Date; productId?: number } = {},
): ErroresFormulario {
  const err: ErroresFormulario = {};
  if (!e.sku.trim()) err.sku = 'sku_requerido';
  if (e.name.trim().length < 2) err.name = 'nombre_corto';
  if (e.price !== null && e.price < 0) err.price = 'precio_negativo';
  if (e.compare_price !== null && e.compare_price > 0 && e.price !== null && e.compare_price <= e.price) {
    err.compare_price = 'comparacion_menor';
  }
  if (e.cost !== null && e.cost < 0) err.cost = 'costo_negativo';
  if (e.precio_desde) {
    const ahora = contexto.ahora ?? new Date();
    if (new Date(e.precio_desde).getTime() < ahora.getTime() - 5 * 60_000) err.precio_desde = 'vigencia_pasada';
  }

  const rastrea = e.track_stock && e.product_type !== 'service';
  if (rastrea && !e.tiene_variantes && modo !== 'editar') {
    for (const f of e.stock) {
      if ((f.qty ?? 0) < 0 || (f.min_level ?? 0) < 0) {
        err.stock = 'cantidad_negativa';
        break;
      }
      if ((f.qty ?? 0) > 0 && !((f.unit_cost ?? e.cost ?? 0) > 0)) {
        err.stock = 'stock_sin_costo';
        break;
      }
    }
  }
  if (e.track_serial) {
    if (e.warranty_months !== null && (e.warranty_months < 0 || !Number.isInteger(e.warranty_months))) {
      err.warranty_months = 'garantia_invalida';
    }
    if (e.auto_generate_serial) {
      const ep = validarPatron(e.serial_pattern);
      if (ep) err.serial_pattern = ep;
    }
  }

  if (e.tiene_variantes) {
    if (e.variantes.length === 0) {
      err.variantes = 'sin_variantes';
    } else {
      const skus = new Set<string>();
      const combos = new Set<string>();
      for (const v of e.variantes) {
        if (!v.sku.trim() || !v.name.trim()) {
          err.variantes = 'variante_incompleta';
          break;
        }
        const k = v.sku.trim().toUpperCase();
        if (skus.has(k) || k === e.sku.trim().toUpperCase()) {
          err.variantes = 'sku_variante_repetido';
          break;
        }
        skus.add(k);
        const c = claveAtributos(v.attributes);
        if (c && combos.has(c)) {
          err.variantes = 'combinacion_repetida';
          break;
        }
        if (c) combos.add(c);
        if (rastrea && !v.id && v.stock.some((st) => (st.qty ?? 0) > 0) && !((v.cost ?? 0) > 0)) {
          err.variantes = 'variante_stock_sin_costo';
          break;
        }
      }
    }
  }

  for (const g of e.modificadores) {
    if (!g.name.trim()) {
      err.modificadores = 'grupo_sin_nombre';
      break;
    }
    if (g.max_selections !== null && g.max_selections < g.min_selections) {
      err.modificadores = 'min_max_invalido';
      break;
    }
    if (g.opciones.some((o) => !o.name.trim())) {
      err.modificadores = 'opcion_sin_nombre';
      break;
    }
  }

  if (e.imagenes.length > limiteImagenes(modo, contexto.imagenesOriginales ?? 0)) err.imagenes = 'demasiadas_imagenes';
  if ([e.weight_kg, e.length_cm, e.width_cm, e.height_cm].some((x) => x !== null && x < 0)) err.dimensiones = 'dimension_negativa';
  const errReceta = validarRecetaForm(e.receta, {
    tieneVariantes: e.tiene_variantes,
    clavesVariantes: e.variantes.map((v) => v.clave),
    rastreaInventario: rastrea,
    excluirIds: idsPropios(e, contexto.productId),
  });
  if (errReceta) err.receta = errReceta;
  const errModo = validarModoVenta(e);
  if (errModo) err.modo_venta = errModo;
  if (esMembresia(e)) {
    // Cada plan es un producto: una membresía no lleva variantes (la base también lo rechaza).
    if (e.tiene_variantes) err.service_type = 'membresia_con_variantes';
    Object.assign(err, validarMembresia(e.membresia));
  }
  return err;
}

// ── Cómo se vende (productos por peso o medida) ────────────────────────────

/** «100GR» desde `price_ref_qty` + `price_ref_unit_code`; '' si el precio es por la unidad de venta. */
export function referenciaComoTexto(p: { price_ref_qty?: unknown; price_ref_unit_code?: unknown }): string {
  const q = Number(p.price_ref_qty);
  const u = String(p.price_ref_unit_code ?? '').trim().toUpperCase();
  return Number.isFinite(q) && q > 0 && u ? `${q}${u}` : '';
}

/** Referencia del texto del formulario («100GR» → 100 g); `null` = por la unidad de venta. */
export function referenciaDesdeTexto(texto: string): ReferenciaPrecio | null {
  const m = /^(\d+(?:\.\d+)?)([A-Z]{1,4})$/.exec((texto ?? '').trim().toUpperCase());
  return m ? { cantidad: Number(m[1]), unidad: m[2] } : null;
}

/** Unidad por defecto al cambiar cómo se vende (kg por peso, metro por medida, unidad por unidad). */
export function unidadParaModo(modo: ModoVenta, actual: string): string {
  const u = (actual ?? '').trim().toUpperCase();
  if (modo === 'weight') return (UNIDADES_PESO as readonly string[]).includes(u) ? u : 'KG';
  if (modo === 'measure') return (UNIDADES_MEDIDA as readonly string[]).includes(u) ? u : 'MT';
  return (UNIDADES_PESO as readonly string[]).includes(u) || (UNIDADES_MEDIDA as readonly string[]).includes(u) ? 'UN' : u || 'UN';
}

/** Validación de «Cómo se vende» (la misma de fn_producto_int_modo_venta). */
export function validarModoVenta(e: EstadoFormularioProducto): CodigoValidacion | null {
  if (e.sale_mode === 'unit') return null;
  if (e.product_type === 'service') return 'modo_venta_servicio';
  if (e.tiene_variantes) return 'modo_venta_con_variantes';
  const u = (e.unit_code ?? '').trim().toUpperCase();
  if (e.sale_mode === 'weight' && !(UNIDADES_PESO as readonly string[]).includes(u)) return 'unidad_peso_invalida';
  if (e.sale_mode === 'measure' && !(UNIDADES_MEDIDA as readonly string[]).includes(u)) return 'unidad_medida_invalida';
  const ref = referenciaDesdeTexto(e.precio_referencia);
  if (e.sale_mode === 'weight' && ref && !referenciaValida(ref, u)) return 'referencia_precio_invalida';
  if (e.min_sale_qty !== null) {
    const dec = decimalesCantidad({ sale_mode: e.sale_mode });
    if (!(e.min_sale_qty > 0) || redondearCantidadProducto(e.min_sale_qty, dec) !== e.min_sale_qty) return 'minimo_invalido';
  }
  return null;
}

/** Campos de «Cómo se vende» para `payload.producto` (siempre viajan: 'unit' deja todo por defecto). */
export function camposModoVenta(e: EstadoFormularioProducto): Pick<
  ProductoCampos,
  'sale_mode' | 'price_ref_qty' | 'price_ref_unit_code' | 'min_sale_qty' | 'require_scale'
> {
  if (e.sale_mode === 'unit' || e.product_type === 'service') {
    return { sale_mode: 'unit', price_ref_qty: null, price_ref_unit_code: null, min_sale_qty: null, require_scale: false };
  }
  const ref = e.sale_mode === 'weight' ? referenciaDesdeTexto(e.precio_referencia) : null;
  return {
    sale_mode: e.sale_mode,
    price_ref_qty: ref ? ref.cantidad : null,
    price_ref_unit_code: ref ? ref.unidad : null,
    min_sale_qty: e.min_sale_qty,
    require_scale: e.sale_mode === 'weight' && e.require_scale,
  };
}

/** Servicio de tipo membresía: muestra «Configuración de membresía» y envía `payload.membresia`. */
export function esMembresia(e: Pick<EstadoFormularioProducto, 'product_type' | 'service_type'>): boolean {
  return e.product_type === 'service' && e.service_type === 'membership';
}

/** El producto y sus variantes: no pueden ser ingredientes de su propia receta. */
export function idsPropios(e: EstadoFormularioProducto, productId?: number): number[] {
  const ids = e.variantes.map((v) => v.id).filter((id): id is number => typeof id === 'number');
  return productId ? [productId, ...ids] : ids;
}

/** Primera sección con error (para desplazar el formulario y abrir el paso). */
export function primeraSeccionConError(errores: ErroresFormulario): SeccionFormulario | null {
  for (const sec of SECCIONES_FORMULARIO) {
    if ((Object.keys(errores) as CampoFormulario[]).some((c) => SECCION_DE_CAMPO[c] === sec)) return sec;
  }
  return null;
}

export function erroresPorSeccion(errores: ErroresFormulario): Partial<Record<SeccionFormulario, number>> {
  const r: Partial<Record<SeccionFormulario, number>> = {};
  for (const c of Object.keys(errores) as CampoFormulario[]) {
    const sec = SECCION_DE_CAMPO[c];
    r[sec] = (r[sec] ?? 0) + 1;
  }
  return r;
}

/** Campo al que pertenece un error devuelto por la RPC. */
export function campoDeErrorRpc(codigo: CodigoErrorProducto): CampoFormulario | null {
  switch (codigo) {
    case 'sku_requerido':
    case 'sku_duplicado':
      return 'sku';
    case 'nombre_corto':
    case 'nombre_requerido':
      return 'name';
    case 'precio_negativo':
      return 'price';
    case 'comparacion_menor':
      return 'compare_price';
    case 'costo_negativo':
      return 'cost';
    case 'vigencia_pasada':
      return 'precio_desde';
    case 'stock_sin_costo':
    case 'cantidad_negativa':
    case 'sucursal_invalida':
      return 'stock';
    case 'categoria_invalida':
      return 'category_id';
    case 'impuesto_invalido':
      return 'impuestos';
    case 'proveedor_invalido':
      return 'proveedor';
    case 'sku_variante_repetido':
    case 'variantes_activas':
      return 'variantes';
    case 'grupo_sin_nombre':
    case 'min_max_invalido':
    case 'modo_seleccion_invalido':
      return 'modificadores';
    case 'imagen_sin_ruta':
      return 'imagenes';
    case 'patron_requerido':
    case 'patron_sin_consecutivo':
      return 'serial_pattern';
    case 'conversion_faltante':
    case 'receta_sin_ingredientes':
    case 'receta_rinde_invalido':
    case 'receta_unidad_invalida':
    case 'receta_ingrediente_invalido':
    case 'receta_autorreferida':
    case 'receta_cantidad_invalida':
    case 'receta_merma_invalida':
    case 'receta_ingrediente_repetido':
    case 'receta_variante_desconocida':
    case 'receta_destino_repetido':
    case 'receta_al_producir_sin_inventario':
      return 'receta';
    case 'tipo_servicio_invalido':
    case 'membresia_con_variantes':
    case 'membresia_con_contratos':
    case 'plan_producto_invalido':
      return 'service_type';
    case 'membresia_unidad_invalida':
    case 'membresia_duracion_invalida':
      return 'membresia_duracion';
    case 'modo_venta_invalido':
    case 'modo_venta_servicio':
    case 'modo_venta_con_variantes':
    case 'unidad_peso_invalida':
    case 'unidad_medida_invalida':
    case 'referencia_precio_invalida':
    case 'decimales_invalidos':
    case 'minimo_invalido':
    case 'tara_invalida':
      return 'modo_venta';
    case 'membresia_cobro_invalido':
      return 'membresia_cobro';
    case 'membresia_gracia_invalida':
      return 'membresia_gracia';
    case 'membresia_sede_invalida':
      return 'membresia_sedes';
    default:
      return null;
  }
}

// ── Payload de la RPC ──────────────────────────────────────────────────────

const limpio = (t: string): string | null => (t.trim() === '' ? null : t.trim());

/**
 * `rutas`: clave de imagen → storage_path ya subido o copiado (las nuevas y
 * las duplicadas). Las existentes viajan por id.
 */
export function construirPayload(
  e: EstadoFormularioProducto,
  modo: ModoFormularioProducto,
  opciones: {
    productId?: number;
    rutas?: Record<string, string>;
    /**
     * Enviar la configuración de la membresía (exige memberships.plans.manage). Sin permiso
     * no se envía: un producto nuevo recibe el plan por defecto y uno existente conserva el suyo.
     */
    conMembresia?: boolean;
  } = {},
): PayloadGuardarProducto {
  const rastrea = e.track_stock && e.product_type !== 'service';
  const rutas = opciones.rutas ?? {};
  const payload: PayloadGuardarProducto = {
    modo,
    ...(modo === 'editar' && opciones.productId ? { product_id: opciones.productId } : {}),
    producto: {
      sku: e.sku.trim(),
      name: e.name.trim(),
      barcode: limpio(e.barcode),
      description: e.description.trim() === '' ? null : e.description,
      category_id: e.category_id,
      unit_code: e.unit_code || 'UN',
      station: e.station,
      product_type: e.product_type,
      service_type: e.product_type === 'service' ? e.service_type : null,
      status: e.status,
      brand: limpio(e.brand),
      reference: limpio(e.reference),
      track_stock: rastrea,
      track_serial: e.track_serial,
      serial_pattern: limpio(e.serial_pattern),
      auto_generate_serial: e.track_serial && e.auto_generate_serial,
      warranty_months: e.track_serial ? e.warranty_months : null,
      weight_kg: e.product_type === 'service' ? null : e.weight_kg,
      length_cm: e.product_type === 'service' ? null : e.length_cm,
      width_cm: e.product_type === 'service' ? null : e.width_cm,
      height_cm: e.product_type === 'service' ? null : e.height_cm,
      is_composite: e.receta.activa,
      ...camposModoVenta(e),
    },
    impuestos: [...e.impuestos],
    categorias_adicionales: e.categorias_adicionales.filter((c) => c !== e.category_id),
    etiquetas: [...e.etiquetas],
    tiene_variantes: e.tiene_variantes,
    modificadores: e.modificadores.map((g) => ({
      ...(modo === 'editar' && g.id ? { id: g.id } : {}),
      name: g.name.trim(),
      selection_mode: g.selection_mode,
      min_selections: g.min_selections,
      max_selections: g.max_selections,
      required: g.required,
      opciones: g.opciones
        .filter((o) => o.name.trim())
        .map((o) => ({
          ...(modo === 'editar' && o.id ? { id: o.id } : {}),
          name: o.name.trim(),
          extra_price: o.extra_price ?? 0,
          is_active: o.is_active,
        })),
    })),
    imagenes: e.imagenes.map((i) => ({
      ...(modo === 'editar' && i.id ? { id: i.id } : { storage_path: rutas[i.clave] ?? i.storage_path }),
      is_primary: i.is_primary,
      alt_text: limpio(i.alt_text),
      shared_image_id: i.shared_image_id ?? null,
    })),
  };

  if (e.price !== null) {
    payload.precio = { price: e.price, compare_price: e.compare_price, desde: e.precio_desde };
  }
  if (e.cost !== null) {
    payload.costo = { cost: e.cost, desde: e.precio_desde };
  }

  const proveedores: NonNullable<PayloadGuardarProducto['proveedores']> = [];
  if (e.proveedor.supplier_id) {
    proveedores.push({
      supplier_id: e.proveedor.supplier_id,
      cost: e.proveedor.cost ?? e.cost ?? 0,
      lead_time_days: e.proveedor.lead_time_days,
      min_order_qty: e.proveedor.min_order_qty,
      supplier_sku: limpio(e.proveedor.supplier_sku),
      notes: limpio(e.proveedor.notes),
      is_preferred: true,
    });
  }
  if (modo === 'duplicar') {
    for (const o of e.otros_proveedores) {
      if (o.supplier_id === e.proveedor.supplier_id) continue;
      proveedores.push({ ...o, is_preferred: false });
    }
  }
  payload.proveedores = proveedores;
  if (modo === 'editar' && !e.proveedor.supplier_id) payload.proveedores_quitar_preferido = true;

  if (rastrea && !e.tiene_variantes) {
    payload.stock = e.stock.map((f) => ({
      branch_id: f.branch_id,
      ...(modo !== 'editar' && (f.qty ?? 0) > 0 ? { qty: f.qty ?? 0, unit_cost: f.unit_cost ?? e.cost ?? 0 } : {}),
      min_level: f.min_level ?? 0,
    }));
  }

  if (e.tiene_variantes) {
    payload.variantes = e.variantes.map((v) => ({
      ...(modo === 'editar' && v.id ? { id: v.id } : {}),
      // Con la clave se ubica en el servidor la receta de una variante que aún no tiene id.
      clave: v.clave,
      sku: v.sku.trim(),
      name: v.name.trim() || nombreVariante(e.name.trim(), v.attributes),
      // La variante no hereda el código del padre (dos tallas con el mismo código
      // hacían cobrar la primera); los faltantes los numera codigos_barras_generar_faltantes.
      barcode: limpio(v.barcode),
      attributes: v.attributes,
      price: v.price,
      compare_price: v.compare_price,
      cost: v.cost,
      status: v.status,
      ...(rastrea
        ? {
            stock: v.stock.map((st) => ({
              branch_id: st.branch_id,
              ...(!(modo === 'editar' && v.id) && (st.qty ?? 0) > 0 ? { qty: st.qty ?? 0 } : {}),
              min_level: st.min_level ?? 0,
            })),
          }
        : {}),
    }));
  }

  payload.receta = payloadRecetaProducto(
    e.receta,
    e.tiene_variantes,
    e.tiene_variantes ? e.variantes.map((v) => v.clave) : [],
  );

  if (esMembresia(e) && opciones.conMembresia !== false) payload.membresia = payloadMembresia(e.membresia);

  if (e.nota.trim()) payload.nota = e.nota;
  return payload;
}

/** Ruta nueva en el bucket product-images para un archivo o una copia. */
export function rutaImagenProducto(organizationId: number, nombreArchivo: string, aleatorio: string): string {
  const ext = (nombreArchivo.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  return `products/${organizationId}/${aleatorio}.${ext}`;
}
