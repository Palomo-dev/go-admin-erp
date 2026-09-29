import type { PayloadRecetaProducto } from './recipeService';
import { supabase } from '@/lib/supabase/config';

/**
 * Servicio del dominio «producto» (detalle y formulario único).
 *
 * Toda escritura que toca varias tablas va por una RPC transaccional
 * (supabase/migrations/20260924100000_producto_detalle_completo.sql y
 * 20260924110000_producto_formulario_transaccional.sql). Las RPC validan la
 * organización con fn_assert_acceso_org y el permiso en el servidor; el
 * navegador solo pasa el id de la organización de la sesión.
 *
 * Los errores de negocio llegan como un código en `message` («sku_duplicado»,
 * «stock_sin_costo»…). `ErrorProducto.codigo` lo expone para que la interfaz
 * lo traduzca (next-intl) y marque el campo.
 */

// ── Errores ────────────────────────────────────────────────────────────────

export const CODIGOS_ERROR_PRODUCTO = [
  'sin_permiso',
  'producto_no_encontrado',
  'variante_no_encontrada',
  'sku_requerido',
  'sku_duplicado',
  'sku_variante_repetido',
  'nombre_requerido',
  'nombre_corto',
  'precio_negativo',
  'precio_requerido',
  'costo_negativo',
  'costo_requerido',
  'comparacion_menor',
  'vigencia_pasada',
  'estado_invalido',
  'tipo_invalido',
  'estacion_invalida',
  'categoria_invalida',
  'impuesto_invalido',
  'etiqueta_invalida',
  'proveedor_invalido',
  'sucursal_invalida',
  'stock_sin_costo',
  'cantidad_negativa',
  'cantidad_invalida',
  'variantes_activas',
  'grupo_sin_nombre',
  'modo_seleccion_invalido',
  'min_max_invalido',
  'imagen_sin_ruta',
  'imagen_invalida',
  'producto_sin_seriales',
  'patron_requerido',
  'patron_sin_consecutivo',
  'excede_stock',
  'sin_seriales',
  'modo_invalido',
  // Receta (fn_producto_guardar · fn_receta_int_guardar_version)
  'conversion_faltante',
  'receta_sin_ingredientes',
  'receta_rinde_invalido',
  'receta_unidad_invalida',
  'receta_ingrediente_invalido',
  'receta_autorreferida',
  'receta_cantidad_invalida',
  'receta_merma_invalida',
  'receta_ingrediente_repetido',
  'receta_variante_desconocida',
  'receta_destino_repetido',
  'receta_al_producir_sin_inventario',
  'guardado_en_curso',
  // Tipo de servicio y membresía (fn_producto_guardar · 20260929000400)
  'tipo_servicio_invalido',
  'membresia_con_variantes',
  'membresia_con_contratos',
  'membresia_unidad_invalida',
  'membresia_duracion_invalida',
  'membresia_cobro_invalido',
  'membresia_gracia_invalida',
  'membresia_sede_invalida',
  'plan_producto_invalido',
  // Cómo se vende (fn_producto_int_modo_venta · 20260929120200)
  'modo_venta_invalido',
  'modo_venta_servicio',
  'modo_venta_con_variantes',
  'unidad_peso_invalida',
  'unidad_medida_invalida',
  'referencia_precio_invalida',
  'decimales_invalidos',
  'minimo_invalido',
  'tara_invalida',
  // PLU de balanza (fn_producto_int_plu · 20260929230300)
  'plu_invalido',
  'plu_duplicado',
] as const;

export type CodigoErrorProducto = (typeof CODIGOS_ERROR_PRODUCTO)[number] | 'desconocido';

export class ErrorProducto extends Error {
  constructor(
    public readonly codigo: CodigoErrorProducto,
    public readonly detalle: string | null,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorProducto';
  }
}

interface ErrorRpc {
  message?: string;
  details?: string | null;
  code?: string;
}

/** Convierte el error de PostgREST en un ErrorProducto con su código. */
export function aErrorProducto(err: ErrorRpc | null | undefined): ErrorProducto {
  const mensaje = err?.message ?? '';
  const codigo = (CODIGOS_ERROR_PRODUCTO as readonly string[]).find(
    (c) => mensaje === c || mensaje.startsWith(`${c}:`) || mensaje.split(/\s/)[0] === c,
  );
  if (codigo) return new ErrorProducto(codigo as CodigoErrorProducto, err?.details ?? null, mensaje);
  if (err?.code === '42501' || /Acceso denegado/i.test(mensaje)) {
    return new ErrorProducto('sin_permiso', err?.details ?? null, mensaje);
  }
  if (/sin costo/i.test(mensaje)) return new ErrorProducto('stock_sin_costo', null, mensaje);
  if (err?.code === '23505') return new ErrorProducto('sku_duplicado', err?.details ?? null, mensaje);
  return new ErrorProducto('desconocido', err?.details ?? null, mensaje || 'Error inesperado');
}

async function rpc<T>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nombre, args);
  if (error) throw aErrorProducto(error);
  return data as T;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numONull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : num(v));

// ── Tipos del detalle ──────────────────────────────────────────────────────

export interface PermisosProducto {
  crear: boolean;
  editar: boolean;
  eliminar: boolean;
  ajustar: boolean;
}

export interface StockSucursalResumen {
  branch_id: number;
  nombre: string;
  principal: boolean;
  activa: boolean;
  qty_on_hand: number;
  qty_reserved: number;
  disponible: number;
  min_level: number;
  avg_cost: number;
  actualizado: string | null;
  con_registro: boolean;
  filas_lote: number;
}

export interface ConteosProducto {
  variantes: number;
  variantes_activas: number;
  modificadores: number;
  imagenes: number;
  proveedores: number;
  etiquetas: number;
  notas: number;
  lotes: number;
  precios: number;
  seriales: number;
  seriales_por_estado: Record<string, number>;
  movimientos: number;
}

export interface ResumenProducto {
  precio: number | null;
  precio_comparacion: number | null;
  precio_desde: string | null;
  costo: number | null;
  costo_desde: string | null;
  stock_total: number;
  reservado: number;
  minimo_total: number;
  sucursales: StockSucursalResumen[];
  conteos: ConteosProducto;
  permisos: PermisosProducto;
}

export interface MovimientoKardex {
  id: number;
  fecha: string;
  product_id: number;
  producto_nombre: string;
  producto_sku: string;
  es_variante: boolean;
  branch_id: number;
  sucursal: string | null;
  direccion: 'in' | 'out';
  cantidad: number;
  costo_unitario: number;
  costo_total: number;
  saldo: number;
  origen: string;
  origen_id: string | null;
  documento: string | null;
  nota: string | null;
  usuario: string | null;
}

export interface FiltrosKardex {
  branchId?: number | null;
  desde?: string | null;
  hasta?: string | null;
  direccion?: 'in' | 'out' | null;
  origen?: string | null;
  limite?: number;
  offset?: number;
}

export interface LoteProducto {
  lot_id: number;
  lot_code: string;
  product_id: number;
  producto_nombre: string;
  expiry_date: string | null;
  supplier_id: number | null;
  proveedor: string | null;
  creado: string;
  qty_on_hand: number;
  qty_reserved: number;
  dias_para_vencer: number | null;
  sucursales: { branch_id: number; sucursal: string; qty_on_hand: number; qty_reserved: number }[];
}

export type TipoHistorial =
  | 'auditoria'
  | 'precio'
  | 'costo'
  | 'kardex'
  | 'compra'
  | 'venta'
  | 'nota'
  | 'serial'
  | 'garantia';

export const TIPOS_HISTORIAL: readonly TipoHistorial[] = [
  'auditoria',
  'precio',
  'costo',
  'kardex',
  'compra',
  'venta',
  'nota',
  'serial',
  'garantia',
];

export interface EventoHistorial {
  clave: string;
  fecha: string;
  tipo: TipoHistorial;
  product_id: number;
  producto_nombre: string | null;
  usuario_id: string | null;
  usuario: string | null;
  detalle: Record<string, unknown>;
}

export interface ResultadoGenerarSeriales {
  creados: { id: number; serial: string }[];
  omitidos: { serial: string; motivo: string }[];
  cupo: number;
}

export interface VarianteEntrada {
  id?: number;
  /** Clave de cliente (VarianteForm.clave): ubica la receta de una variante nueva. */
  clave?: string;
  sku: string;
  name: string;
  barcode?: string | null;
  attributes: Record<string, string>;
  price?: number | null;
  compare_price?: number | null;
  cost?: number | null;
  status?: 'active' | 'inactive' | 'discontinued' | 'deleted';
  stock?: { branch_id: number; qty?: number; min_level?: number }[];
}

// ── Detalle ────────────────────────────────────────────────────────────────

function normalizarResumen(r: Record<string, unknown>): ResumenProducto {
  const conteos = (r.conteos ?? {}) as Record<string, unknown>;
  return {
    precio: numONull(r.precio),
    precio_comparacion: numONull(r.precio_comparacion),
    precio_desde: (r.precio_desde as string) ?? null,
    costo: numONull(r.costo),
    costo_desde: (r.costo_desde as string) ?? null,
    stock_total: num(r.stock_total),
    reservado: num(r.reservado),
    minimo_total: num(r.minimo_total),
    sucursales: ((r.sucursales as Record<string, unknown>[]) ?? []).map((s) => ({
      branch_id: num(s.branch_id),
      nombre: String(s.nombre ?? ''),
      principal: Boolean(s.principal),
      activa: s.activa !== false,
      qty_on_hand: num(s.qty_on_hand),
      qty_reserved: num(s.qty_reserved),
      disponible: num(s.disponible),
      min_level: num(s.min_level),
      avg_cost: num(s.avg_cost),
      actualizado: (s.actualizado as string) ?? null,
      con_registro: Boolean(s.con_registro),
      filas_lote: num(s.filas_lote),
    })),
    conteos: {
      variantes: num(conteos.variantes),
      variantes_activas: num(conteos.variantes_activas),
      modificadores: num(conteos.modificadores),
      imagenes: num(conteos.imagenes),
      proveedores: num(conteos.proveedores),
      etiquetas: num(conteos.etiquetas),
      notas: num(conteos.notas),
      lotes: num(conteos.lotes),
      precios: num(conteos.precios),
      seriales: num(conteos.seriales),
      seriales_por_estado: Object.fromEntries(
        Object.entries((conteos.seriales_por_estado as Record<string, unknown>) ?? {}).map(([k, v]) => [k, num(v)]),
      ),
      movimientos: num(conteos.movimientos),
    },
    permisos: {
      crear: Boolean((r.permisos as Record<string, unknown>)?.crear),
      editar: Boolean((r.permisos as Record<string, unknown>)?.editar),
      eliminar: Boolean((r.permisos as Record<string, unknown>)?.eliminar),
      ajustar: Boolean((r.permisos as Record<string, unknown>)?.ajustar),
    },
  };
}

export const productoService = {
  async resumen(organizationId: number, productId: number): Promise<ResumenProducto> {
    const data = await rpc<Record<string, unknown>>('fn_producto_resumen', {
      p_organization_id: organizationId,
      p_product_id: productId,
    });
    return normalizarResumen(data ?? {});
  },

  async kardex(
    organizationId: number,
    productId: number,
    filtros: FiltrosKardex = {},
  ): Promise<{ filas: MovimientoKardex[]; total: number }> {
    const data = await rpc<Record<string, unknown>[]>('fn_producto_kardex', {
      p_organization_id: organizationId,
      p_product_id: productId,
      p_branch_id: filtros.branchId ?? null,
      p_desde: filtros.desde ?? null,
      p_hasta: filtros.hasta ?? null,
      p_direccion: filtros.direccion ?? null,
      p_origen: filtros.origen ?? null,
      p_limit: filtros.limite ?? 50,
      p_offset: filtros.offset ?? 0,
    });
    const filas = (data ?? []).map((m) => ({
      id: num(m.id),
      fecha: String(m.fecha),
      product_id: num(m.product_id),
      producto_nombre: String(m.producto_nombre ?? ''),
      producto_sku: String(m.producto_sku ?? ''),
      es_variante: Boolean(m.es_variante),
      branch_id: num(m.branch_id),
      sucursal: (m.sucursal as string) ?? null,
      direccion: (m.direccion === 'out' ? 'out' : 'in') as 'in' | 'out',
      cantidad: num(m.cantidad),
      costo_unitario: num(m.costo_unitario),
      costo_total: num(m.costo_total),
      saldo: num(m.saldo),
      origen: String(m.origen ?? ''),
      origen_id: (m.origen_id as string) ?? null,
      documento: (m.documento as string) ?? null,
      nota: (m.nota as string) ?? null,
      usuario: (m.usuario as string) ?? null,
    }));
    return { filas, total: data?.length ? num(data[0].total_filas) : 0 };
  },

  async lotes(organizationId: number, productId: number): Promise<LoteProducto[]> {
    const data = await rpc<Record<string, unknown>[]>('fn_producto_lotes', {
      p_organization_id: organizationId,
      p_product_id: productId,
    });
    return (data ?? []).map((l) => ({
      lot_id: num(l.lot_id),
      lot_code: String(l.lot_code ?? ''),
      product_id: num(l.product_id),
      producto_nombre: String(l.producto_nombre ?? ''),
      expiry_date: (l.expiry_date as string) ?? null,
      supplier_id: numONull(l.supplier_id),
      proveedor: (l.proveedor as string) ?? null,
      creado: String(l.creado),
      qty_on_hand: num(l.qty_on_hand),
      qty_reserved: num(l.qty_reserved),
      dias_para_vencer: numONull(l.dias_para_vencer),
      sucursales: ((l.sucursales as Record<string, unknown>[]) ?? []).map((s) => ({
        branch_id: num(s.branch_id),
        sucursal: String(s.sucursal ?? ''),
        qty_on_hand: num(s.qty_on_hand),
        qty_reserved: num(s.qty_reserved),
      })),
    }));
  },

  async historial(
    organizationId: number,
    productId: number,
    opciones: { tipos?: TipoHistorial[] | null; desde?: string | null; hasta?: string | null; limite?: number; offset?: number } = {},
  ): Promise<{ eventos: EventoHistorial[]; total: number }> {
    const data = await rpc<Record<string, unknown>[]>('fn_producto_historial', {
      p_organization_id: organizationId,
      p_product_id: productId,
      p_tipos: opciones.tipos && opciones.tipos.length > 0 ? opciones.tipos : null,
      p_desde: opciones.desde ?? null,
      p_hasta: opciones.hasta ?? null,
      p_limit: opciones.limite ?? 50,
      p_offset: opciones.offset ?? 0,
    });
    const eventos = (data ?? []).map((e) => ({
      clave: String(e.clave),
      fecha: String(e.fecha),
      tipo: e.tipo as TipoHistorial,
      product_id: num(e.product_id),
      producto_nombre: (e.producto_nombre as string) ?? null,
      usuario_id: (e.usuario_id as string) ?? null,
      usuario: (e.usuario as string) ?? null,
      detalle: (e.detalle as Record<string, unknown>) ?? {},
    }));
    return { eventos, total: data?.length ? num(data[0].total_filas) : 0 };
  },

  async generarSeriales(
    organizationId: number,
    productId: number,
    branchId: number,
    opciones: { cantidad?: number; seriales?: string[]; costo?: number | null; nota?: string | null },
  ): Promise<ResultadoGenerarSeriales> {
    const data = await rpc<Record<string, unknown>>('fn_producto_generar_seriales', {
      p_organization_id: organizationId,
      p_product_id: productId,
      p_branch_id: branchId,
      p_cantidad: opciones.cantidad ?? null,
      p_seriales: opciones.seriales && opciones.seriales.length > 0 ? opciones.seriales : null,
      p_costo: opciones.costo ?? null,
      p_nota: opciones.nota ?? null,
    });
    return {
      creados: (data?.creados as ResultadoGenerarSeriales['creados']) ?? [],
      omitidos: (data?.omitidos as ResultadoGenerarSeriales['omitidos']) ?? [],
      cupo: num(data?.cupo),
    };
  },

  async cambiarEstadoSeriales(
    organizationId: number,
    serialIds: number[],
    estado: 'in_stock' | 'damaged' | 'rma' | 'returned' | 'sold',
    nota?: string | null,
  ): Promise<{ actualizados: number; rechazados: { id: number; serial: string; estado: string }[] }> {
    const data = await rpc<Record<string, unknown>>('fn_producto_serial_cambiar_estado', {
      p_organization_id: organizationId,
      p_serial_ids: serialIds,
      p_estado: estado,
      p_nota: nota ?? null,
    });
    return {
      actualizados: num(data?.actualizados),
      rechazados: (data?.rechazados as { id: number; serial: string; estado: string }[]) ?? [],
    };
  },

  async guardarVariante(organizationId: number, parentId: number, variante: VarianteEntrada): Promise<number> {
    const data = await rpc<{ id: number }>('fn_producto_variante_guardar', {
      p_organization_id: organizationId,
      p_parent_id: parentId,
      p_variante: variante,
    });
    return num(data?.id);
  },

  async estadoVariante(
    organizationId: number,
    variantId: number,
    estado: 'active' | 'inactive' | 'discontinued' | 'deleted',
  ): Promise<void> {
    await rpc('fn_producto_variante_estado', {
      p_organization_id: organizationId,
      p_variant_id: variantId,
      p_status: estado,
    });
  },

  async fijarPrecio(
    organizationId: number,
    productId: number,
    precio: number,
    comparacion?: number | null,
    desde?: string | null,
  ): Promise<boolean> {
    const data = await rpc<{ cambio: boolean }>('fn_producto_fijar_precio', {
      p_organization_id: organizationId,
      p_product_id: productId,
      p_precio: precio,
      p_comparacion: comparacion ?? null,
      p_desde: desde ?? null,
    });
    return Boolean(data?.cambio);
  },

  async fijarCosto(
    organizationId: number,
    productId: number,
    costo: number,
    desde?: string | null,
    supplierId?: number | null,
  ): Promise<boolean> {
    const data = await rpc<{ cambio: boolean }>('fn_producto_fijar_costo', {
      p_organization_id: organizationId,
      p_product_id: productId,
      p_costo: costo,
      p_desde: desde ?? null,
      p_supplier_id: supplierId ?? null,
    });
    return Boolean(data?.cambio);
  },

  async ordenarImagenes(
    organizationId: number,
    productId: number,
    ids: number[],
    principalId?: number | null,
  ): Promise<void> {
    await rpc('fn_producto_imagenes_ordenar', {
      p_organization_id: organizationId,
      p_product_id: productId,
      p_ids: ids,
      p_principal_id: principalId ?? null,
    });
  },

  async cambiarEstado(
    organizationId: number,
    productId: number,
    estado: 'active' | 'inactive' | 'discontinued' | 'deleted',
  ): Promise<void> {
    await rpc('fn_producto_cambiar_estado', {
      p_organization_id: organizationId,
      p_product_id: productId,
      p_status: estado,
    });
  },

  // ── Formulario ─────────────────────────────────────────────────────────

  async paraFormulario(organizationId: number, productId: number): Promise<DatosFormularioProducto> {
    return rpc<DatosFormularioProducto>('fn_producto_para_formulario', {
      p_organization_id: organizationId,
      p_product_id: productId,
    });
  },

  async guardar(organizationId: number, payload: PayloadGuardarProducto): Promise<ResultadoGuardarProducto> {
    const data = await rpc<ResultadoGuardarProducto>('fn_producto_guardar', {
      p_organization_id: organizationId,
      p_payload: payload,
    });
    return {
      ...data,
      price: num(data?.price),
      cost: num(data?.cost),
      variantes: data?.variantes ?? [],
      imagenes_quitadas: data?.imagenes_quitadas ?? [],
      recetas: data?.recetas ?? [],
    };
  },
};

// ── Tipos del formulario (contrato de fn_producto_guardar) ────────────────

export type ModoFormularioProducto = 'crear' | 'editar' | 'duplicar';

export interface ProductoCampos {
  sku: string;
  name: string;
  barcode?: string | null;
  description?: string | null;
  category_id?: number | null;
  unit_code?: string | null;
  station?: string | null;
  product_type: 'product' | 'service';
  /** Solo si `product_type = 'service'`; en editar, sin la clave se conserva el que tenga. */
  service_type?: TipoServicioProducto | null;
  status: 'active' | 'inactive' | 'discontinued';
  brand?: string | null;
  reference?: string | null;
  track_stock: boolean;
  track_serial: boolean;
  serial_pattern?: string | null;
  auto_generate_serial: boolean;
  warranty_months?: number | null;
  /**
   * Maneja lotes (FEFO en la venta, lote en cada entrada). Sin la clave se conserva
   * el valor guardado; sin control de existencias queda en false (inv_b7_3/4).
   */
  track_lots?: boolean;
  weight_kg?: number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  is_composite?: boolean;
  /**
   * Cómo se vende (PRODUCTOS-POR-PESO-BASCULA.md): 'unit' | 'weight' | 'measure'.
   * El precio de `precio.price` es SIEMPRE por `unit_code` (por kg).
   */
  sale_mode?: 'unit' | 'weight' | 'measure';
  /** Presentación del precio («cada 100 g» = 100 + 'GR'); sin valor, por la unidad de venta. */
  price_ref_qty?: number | null;
  price_ref_unit_code?: string | null;
  min_sale_qty?: number | null;
  require_scale?: boolean;
  /** PLU de balanza (1–99.999, único por organización); solo por peso o medida. */
  scale_plu?: number | null;
}

export interface ProveedorEntrada {
  supplier_id: number;
  cost?: number | null;
  lead_time_days?: number | null;
  min_order_qty?: number | null;
  supplier_sku?: string | null;
  notes?: string | null;
  is_preferred: boolean;
}

export interface OpcionModificadorEntrada {
  id?: number;
  name: string;
  extra_price: number;
  is_active: boolean;
}

export interface GrupoModificadorEntrada {
  id?: number;
  name: string;
  selection_mode: 'single' | 'multiple';
  min_selections: number;
  max_selections: number | null;
  required: boolean;
  opciones: OpcionModificadorEntrada[];
}

export interface ImagenEntrada {
  id?: number;
  storage_path?: string;
  is_primary: boolean;
  alt_text?: string | null;
  shared_image_id?: number | null;
}

export interface PayloadGuardarProducto {
  modo: ModoFormularioProducto;
  product_id?: number;
  producto: ProductoCampos;
  precio?: { price: number; compare_price?: number | null; desde?: string | null };
  costo?: { cost: number; desde?: string | null };
  impuestos?: string[];
  categorias_adicionales?: number[];
  etiquetas?: number[];
  proveedores?: ProveedorEntrada[];
  proveedores_quitar_preferido?: boolean;
  /** Con `track_lots`, la entrada inicial va al lote `lot_code` (se crea si no existe; vacío = L-AAAAMMDD). */
  stock?: { branch_id: number; qty?: number; min_level?: number; unit_cost?: number; lot_code?: string; expiry_date?: string | null }[];
  tiene_variantes: boolean;
  variantes?: VarianteEntrada[];
  modificadores?: GrupoModificadorEntrada[];
  imagenes?: ImagenEntrada[];
  nota?: string | null;
  /** Una por intento de guardado lógico: un reintento devuelve el mismo resultado. */
  clave_idempotencia?: string;
  /** Sin esta clave las recetas no se tocan. */
  receta?: PayloadRecetaProducto;
  /**
   * Plan del producto membresía (exige memberships.plans.manage). Sin la clave, un producto
   * membresía nuevo recibe el plan por defecto (1 mes, por adelantado) y uno existente lo conserva.
   */
  membresia?: MembresiaEntrada;
}

export type TipoServicioProducto = 'standard' | 'membership' | 'session_pack' | 'class' | 'course' | 'appointment';

/** `payload.membresia` de fn_producto_guardar (se guarda en membership_plans, 1:1 con el producto). */
export interface MembresiaEntrada {
  duration_unit: 'day' | 'week' | 'month' | 'year';
  duration_value: number;
  billing_mode: 'prepaid' | 'on_credit';
  /**
   * `automatic`: la tarea horaria deja la renovación pendiente 7 días antes del vencimiento; nunca
   * cobra ni factura sola (docs/design/MEMBRESIAS-FASE-1-2.md §12).
   */
  renewal_mode: 'manual' | 'automatic';
  grace_days: number;
  requires_activation: boolean;
  activation_window_days: number | null;
  freeze_allowed: boolean;
  freeze_max_times: number | null;
  freeze_max_days: number | null;
  /** Vacío = todas las sedes. */
  allowed_branch_ids: number[];
  /** null = sin restricción. Días ISO (1 = lunes); horas HH:mm, ambas o ninguna. */
  access_schedule: { dias: number[]; desde?: string; hasta?: string } | null;
  daily_checkin_limit: number | null;
}

/** Clave `membresia` de fn_producto_para_formulario (null si el producto no tiene plan). */
export interface MembresiaFormularioServidor {
  plan_id: number;
  duration_unit: string | null;
  duration_value: number | null;
  billing_mode: string | null;
  renewal_mode: string | null;
  grace_days: number | null;
  requires_activation: boolean | null;
  activation_window_days: number | null;
  freeze_allowed: boolean | null;
  freeze_max_times: number | null;
  freeze_max_days: number | null;
  allowed_branch_ids: number[] | null;
  access_schedule: { dias?: unknown; desde?: unknown; hasta?: unknown } | null;
  daily_checkin_limit: number | null;
  /** Membresías no canceladas ni vencidas del plan. */
  membresias_vivas: number | null;
}

export interface ResultadoGuardarProducto {
  id: number;
  uuid: string;
  sku: string;
  name: string;
  price: number;
  cost: number;
  variantes: { id: number; sku: string; clave?: string | null }[];
  imagenes_quitadas: string[];
  recetas?: { destino: 'producto' | { variante: string }; product_id: number; recipe_id: number; version: number; cambio: boolean }[];
  /** La clave de idempotencia ya se había guardado: es el resultado de entonces. */
  repetido?: boolean;
  service_type?: TipoServicioProducto | null;
  /** Plan creado o actualizado cuando el producto es membresía. */
  membership_plan_id?: number | null;
}

export interface DatosFormularioProducto {
  producto: Record<string, unknown> & {
    id: number;
    uuid: string;
    sku: string;
    name: string;
    status: string;
  };
  precio: { price: number; compare_price: number | null; desde: string } | null;
  precio_programado: { price: number; compare_price: number | null; desde: string } | null;
  costo: { cost: number; supplier_id: number | null; desde: string } | null;
  impuestos: string[];
  categorias_adicionales: number[];
  categorias_por_regla: number[];
  etiquetas: number[];
  proveedores: {
    id: number;
    supplier_id: number;
    nombre: string;
    cost: number;
    lead_time_days: number | null;
    min_order_qty: number | null;
    supplier_sku: string | null;
    notes: string | null;
    is_preferred: boolean;
  }[];
  stock: {
    branch_id: number;
    nombre: string;
    principal: boolean;
    activa: boolean;
    qty_on_hand: number;
    min_level: number;
    avg_cost: number;
  }[];
  variantes: {
    id: number;
    sku: string;
    barcode: string | null;
    name: string;
    attributes: Record<string, string>;
    status: string;
    price: number | null;
    compare_price: number | null;
    cost: number | null;
    stock: { branch_id: number; qty_on_hand: number; min_level: number }[];
  }[];
  modificadores: {
    id: number;
    name: string;
    selection_mode: 'single' | 'multiple';
    min_selections: number;
    max_selections: number | null;
    required: boolean;
    display_order: number;
    opciones: { id: number; name: string; extra_price: number; is_active: boolean; display_order: number }[];
  }[];
  imagenes: {
    id: number;
    storage_path: string;
    is_primary: boolean;
    alt_text: string | null;
    display_order: number;
    shared_image_id: number | null;
  }[];
  /** Configuración del plan si el producto es (o fue) membresía. */
  membresia?: MembresiaFormularioServidor | null;
}
