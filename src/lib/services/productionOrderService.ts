import { supabase } from '@/lib/supabase/config';
import { aPermisosInventario, SIN_PERMISOS_INVENTARIO } from '@/lib/inventario/permisos';
import type { PermisosInventario } from '@/lib/inventario/nucleo/tipos';
import type { ErrorRpc } from '@/lib/inventario/nucleo/errores';

/**
 * Órdenes de producción: fachada de RPC (INVENTARIO-PLAN.md §5.6, bloque B5).
 *
 * Nada aquí escribe tablas. Crear, confirmar, iniciar, cancelar y completar
 * pasan por RPC SECURITY DEFINER que exigen el permiso `producir` en el
 * servidor; completar mueve el stock por la primitiva del núcleo en UNA
 * transacción (consumos, terminado a su costo real y estado). Si la RPC falla
 * la orden NO queda completada: ya no hay respaldo que marque `completed` sin
 * mover stock (antes `completeOrder` hacía un UPDATE si la RPC fallaba). La base
 * además rechaza escrituras directas a `production_orders` y sus consumos
 * (`produccion_solo_por_rpc`).
 */

export type ProductionOrderStatus = 'draft' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
export const ESTADOS_PRODUCCION: readonly ProductionOrderStatus[] = ['draft', 'confirmed', 'in_progress', 'completed', 'cancelled'];
export type AccionProduccion = 'confirmar' | 'iniciar' | 'cancelar' | 'eliminar';

export interface OrdenProduccionFila {
  id: number;
  numero: string;
  estado: ProductionOrderStatus;
  producto: { id: number; nombre: string; sku: string | null; unidad: string; decimales: number };
  receta: { id: number; version: number; nombre: string | null; rinde: number; activa: boolean; product_id: number };
  sucursal: { id: number; nombre: string };
  a_producir: number;
  producido: number;
  creado_en: string | null;
  creado_por: string | null;
  confirmado_en: string | null;
  iniciado_en: string | null;
  completado_en: string | null;
  cancelado_en: string | null;
  motivo_cancelacion: string | null;
  notas: string | null;
  costo_real: number | null;
  costo_real_unidad: number | null;
  costo_estimado: number | null;
  costo_estimado_unidad: number | null;
  faltantes: number;
  primer_faltante: { nombre: string; unidad: string; faltante: number } | null;
  /** Completada antes de B5 sin consumos (el respaldo que no movía stock). */
  sin_consumos: boolean;
}

export interface KpisProduccion {
  por_confirmar: number;
  confirmadas: number;
  en_proceso: number;
  completadas_mes: number;
  costo_real_mes: number | null;
  planeado_mes: number;
  producido_mes: number;
  ordenes_mes: number;
}

export interface FiltrosProduccion {
  busqueda?: string;
  estados?: ProductionOrderStatus[];
  sucursal?: number;
  producto?: number;
  desde?: string;
  hasta?: string;
  periodo?: 'mes';
  orden?: 'fecha' | 'numero';
  direccion?: 'asc' | 'desc';
  desde_fila?: number;
  limite?: number;
}

export interface ListadoProduccion {
  filas: OrdenProduccionFila[];
  total: number;
  kpis: KpisProduccion;
  permisos: PermisosInventario;
}

export interface LineaNecesidad {
  orden: number;
  ingredient_product_id: number;
  nombre: string;
  sku: string | null;
  unidad: string;
  unidad_receta: string;
  track_stock: boolean;
  opcional: boolean;
  merma_pct: number;
  necesario: number;
  disponible: number;
  faltante: number;
  fuente: 'promedio_sucursal' | 'costo_vigente' | 'sin_costo';
  costo_unitario: number | null;
  costo_linea: number | null;
  error: 'ingrediente_invalido' | 'conversion_faltante' | null;
}

export interface NecesidadesProduccion {
  permitido: boolean;
  rinde: number;
  cantidad: number;
  costo_total: number | null;
  costo_unidad: number | null;
  completo: boolean;
  lineas_con_error: number;
  faltantes: number;
  lineas: LineaNecesidad[];
}

export interface ConsumoProduccion {
  id: number;
  ingredient_product_id: number;
  nombre: string;
  sku: string | null;
  cantidad: number;
  unidad: string;
  lote: { id: number; codigo: string } | null;
  movement_id: number | null;
  costo_unitario: number | null;
  costo_total: number | null;
}

export interface DetalleProduccion {
  orden: OrdenProduccionFila & {
    confirmado_por: string | null;
    iniciado_por: string | null;
    completado_por: string | null;
    cancelado_por: string | null;
    maximo: number;
  };
  necesidades: NecesidadesProduccion | null;
  consumos: ConsumoProduccion[];
  terminado: { movement_id: number; cantidad: number; costo_unitario: number | null; promedio_despues: number | null } | null;
  traslados: { id: number; codigo: string; estado: string; destino: { id: number; nombre: string }; cantidad: number; creado_en: string | null }[];
  permisos: PermisosInventario;
}

export interface OrdenGuardar {
  id?: number;
  branch_id: number;
  product_id: number;
  recipe_id?: number | null;
  qty_to_produce: number;
  notes?: string | null;
  confirmar?: boolean;
}

export interface ResultadoGuardarOrden {
  id: number;
  numero: string;
  status: ProductionOrderStatus;
  repetido: boolean;
}

export interface ResultadoCompletar {
  success: boolean;
  order_id: number;
  produced_qty: number;
  ya_completada: boolean;
  ingredients_processed?: number;
  movement_id?: number;
  total_cost: number | null;
  unit_cost: number | null;
  avg_cost_after?: number | null;
}

/** Faltante que devuelve `complete_production_order` sin confirmación (`faltante_sin_confirmar`). */
export interface FaltanteProduccion {
  product_id: number;
  nombre: string;
  unidad: string;
  necesario: number;
  disponible: number;
  faltante: number;
}

/** Errores de negocio de las RPC de producción (claves en `inventarioProduccion.errores.*`). */
export const ERRORES_PRODUCCION = [
  'orden_no_encontrada',
  'orden_estado_invalido',
  'orden_no_editable',
  'producto_no_encontrado',
  'producto_padre',
  'producto_sin_inventario',
  'receta_no_encontrada',
  'receta_inactiva',
  'receta_ingrediente_invalido',
  'conversion_faltante',
  'cantidad_invalida',
  'cantidad_decimales',
  'excede_lo_planeado',
  'faltante_sin_confirmar',
  'motivo_requerido',
  'accion_invalida',
  'produccion_solo_por_rpc',
  'SUCURSAL_NO_ES_DE_LA_ORG',
] as const;
export type ErrorProduccionClave = (typeof ERRORES_PRODUCCION)[number] | 'sin_permiso' | 'desconocido';

export class ErrorProduccion extends Error implements ErrorRpc {
  readonly code: string | null;
  readonly details: string | null;
  constructor(error: ErrorRpc) {
    super(error.message ?? 'desconocido');
    this.name = 'ErrorProduccion';
    this.code = error.code ?? null;
    this.details = error.details ?? null;
  }
  get sinPermiso(): boolean {
    return this.code === '42501' && this.message !== 'SUCURSAL_NO_ES_DE_LA_ORG';
  }
  get noEncontrado(): boolean {
    return this.code === 'P0002';
  }
  get clave(): ErrorProduccionClave {
    const m = this.message.trim();
    const conocido = (ERRORES_PRODUCCION as readonly string[]).find((c) => m === c || m.startsWith(`${c}:`));
    if (conocido) return conocido as ErrorProduccionClave;
    if (this.code === '42501') return 'sin_permiso';
    return 'desconocido';
  }
  /** Faltantes de `faltante_sin_confirmar` (JSON en `details`). */
  get faltantes(): FaltanteProduccion[] {
    if (this.message !== 'faltante_sin_confirmar' || !this.details) return [];
    try {
      const d = JSON.parse(this.details) as Record<string, unknown>[];
      return Array.isArray(d)
        ? d.map((x) => ({
            product_id: num(x.product_id),
            nombre: String(x.nombre ?? ''),
            unidad: String(x.unidad ?? ''),
            necesario: num(x.necesario),
            disponible: num(x.disponible),
            faltante: num(x.faltante),
          }))
        : [];
    } catch {
      return [];
    }
  }
}

// ─── Normalización (numeric de PostgREST llega como número o texto) ─────────

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numONull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : num(v));
const textoONull = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

export function aOrdenFila(v: unknown): OrdenProduccionFila {
  const d = obj(v);
  const p = obj(d.producto);
  const r = obj(d.receta);
  const s = obj(d.sucursal);
  const pf = d.primer_faltante ? obj(d.primer_faltante) : null;
  const estado = String(d.estado ?? 'draft') as ProductionOrderStatus;
  return {
    id: num(d.id),
    numero: String(d.numero ?? `OP-${num(d.id)}`),
    estado: (ESTADOS_PRODUCCION as readonly string[]).includes(estado) ? estado : 'draft',
    producto: {
      id: num(p.id),
      nombre: String(p.nombre ?? ''),
      sku: textoONull(p.sku),
      unidad: String(p.unidad ?? 'UN').trim() || 'UN',
      decimales: num(p.decimales),
    },
    receta: {
      id: num(r.id),
      version: num(r.version) || 1,
      nombre: textoONull(r.nombre),
      rinde: num(r.rinde) || 1,
      activa: r.activa === true,
      product_id: num(r.product_id),
    },
    sucursal: { id: num(s.id), nombre: String(s.nombre ?? '') },
    a_producir: num(d.a_producir),
    producido: num(d.producido),
    creado_en: textoONull(d.creado_en),
    creado_por: textoONull(d.creado_por),
    confirmado_en: textoONull(d.confirmado_en),
    iniciado_en: textoONull(d.iniciado_en),
    completado_en: textoONull(d.completado_en),
    cancelado_en: textoONull(d.cancelado_en),
    motivo_cancelacion: textoONull(d.motivo_cancelacion),
    notas: textoONull(d.notas),
    costo_real: numONull(d.costo_real),
    costo_real_unidad: numONull(d.costo_real_unidad),
    costo_estimado: numONull(d.costo_estimado),
    costo_estimado_unidad: numONull(d.costo_estimado_unidad),
    faltantes: num(d.faltantes),
    primer_faltante: pf ? { nombre: String(pf.nombre ?? ''), unidad: String(pf.unidad ?? ''), faltante: num(pf.faltante) } : null,
    sin_consumos: d.sin_consumos === true,
  };
}

export function aNecesidades(v: unknown): NecesidadesProduccion | null {
  if (!v) return null;
  const d = obj(v);
  const lineas = Array.isArray(d.lineas) ? (d.lineas as unknown[]) : [];
  return {
    permitido: d.permitido !== false,
    rinde: num(d.rinde) || 1,
    cantidad: num(d.cantidad),
    costo_total: numONull(d.costo_total),
    costo_unidad: numONull(d.costo_unidad),
    completo: d.completo === true,
    lineas_con_error: num(d.lineas_con_error),
    faltantes: num(d.faltantes),
    lineas: lineas.map((x) => {
      const l = obj(x);
      return {
        orden: num(l.orden),
        ingredient_product_id: num(l.ingredient_product_id),
        nombre: String(l.nombre ?? ''),
        sku: textoONull(l.sku),
        unidad: String(l.unidad ?? '').trim(),
        unidad_receta: String(l.unidad_receta ?? '').trim(),
        track_stock: l.track_stock === true,
        opcional: l.opcional === true,
        merma_pct: num(l.merma_pct),
        necesario: num(l.necesario),
        disponible: num(l.disponible),
        faltante: num(l.faltante),
        fuente: (l.fuente as LineaNecesidad['fuente']) ?? 'sin_costo',
        costo_unitario: numONull(l.costo_unitario),
        costo_linea: numONull(l.costo_linea),
        error: (l.error as LineaNecesidad['error']) ?? null,
      };
    }),
  };
}

function aKpis(v: unknown): KpisProduccion {
  const d = obj(v);
  return {
    por_confirmar: num(d.por_confirmar),
    confirmadas: num(d.confirmadas),
    en_proceso: num(d.en_proceso),
    completadas_mes: num(d.completadas_mes),
    costo_real_mes: numONull(d.costo_real_mes),
    planeado_mes: num(d.planeado_mes),
    producido_mes: num(d.producido_mes),
    ordenes_mes: num(d.ordenes_mes),
  };
}

function aDetalle(v: unknown): DetalleProduccion {
  const d = obj(v);
  const o = obj(d.orden);
  const ter = d.terminado ? obj(d.terminado) : null;
  return {
    orden: {
      ...aOrdenFila(o),
      confirmado_por: textoONull(o.confirmado_por),
      iniciado_por: textoONull(o.iniciado_por),
      completado_por: textoONull(o.completado_por),
      cancelado_por: textoONull(o.cancelado_por),
      maximo: num(o.maximo),
    },
    necesidades: aNecesidades(d.necesidades),
    consumos: (Array.isArray(d.consumos) ? (d.consumos as unknown[]) : []).map((x) => {
      const c = obj(x);
      const lote = c.lote ? obj(c.lote) : null;
      return {
        id: num(c.id),
        ingredient_product_id: num(c.ingredient_product_id),
        nombre: String(c.nombre ?? ''),
        sku: textoONull(c.sku),
        cantidad: num(c.cantidad),
        unidad: String(c.unidad ?? '').trim(),
        lote: lote ? { id: num(lote.id), codigo: String(lote.codigo ?? '') } : null,
        movement_id: numONull(c.movement_id),
        costo_unitario: numONull(c.costo_unitario),
        costo_total: numONull(c.costo_total),
      };
    }),
    terminado: ter
      ? {
          movement_id: num(ter.movement_id),
          cantidad: num(ter.cantidad),
          costo_unitario: numONull(ter.costo_unitario),
          promedio_despues: numONull(ter.promedio_despues),
        }
      : null,
    traslados: (Array.isArray(d.traslados) ? (d.traslados as unknown[]) : []).map((x) => {
      const t = obj(x);
      const dest = obj(t.destino);
      return {
        id: num(t.id),
        codigo: String(t.codigo ?? ''),
        estado: String(t.estado ?? ''),
        destino: { id: num(dest.id), nombre: String(dest.nombre ?? '') },
        cantidad: num(t.cantidad),
        creado_en: textoONull(t.creado_en),
      };
    }),
    permisos: d.permisos ? aPermisosInventario(d.permisos) : SIN_PERMISOS_INVENTARIO,
  };
}

/** Clave de idempotencia por intento (crear o completar). */
export function nuevaClaveProduccion(prefijo: 'crear' | 'completar', id?: number): string {
  const aleatorio =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefijo}:${id ?? 'n'}:${aleatorio}`;
}

class ProductionOrderService {
  async listar(organizationId: number, filtros: FiltrosProduccion = {}, senal?: AbortSignal): Promise<ListadoProduccion> {
    let q = supabase.rpc('fn_produccion_listado', { p_org: organizationId, p_filtros: filtros });
    if (senal) q = q.abortSignal(senal);
    const { data, error } = await q;
    if (error) throw new ErrorProduccion(error);
    const d = obj(data);
    return {
      filas: (Array.isArray(d.filas) ? (d.filas as unknown[]) : []).map(aOrdenFila),
      total: num(d.total),
      kpis: aKpis(d.kpi),
      permisos: d.permisos ? aPermisosInventario(d.permisos) : SIN_PERMISOS_INVENTARIO,
    };
  }

  async detalle(organizationId: number, id: number, senal?: AbortSignal): Promise<DetalleProduccion> {
    let q = supabase.rpc('fn_produccion_detalle', { p_org: organizationId, p_id: id });
    if (senal) q = q.abortSignal(senal);
    const { data, error } = await q;
    if (error) throw new ErrorProduccion(error);
    return aDetalle(data);
  }

  /** Necesidades y costo estimado (mismo cálculo que el costo de la receta y la venta). */
  async necesidades(
    organizationId: number,
    branchId: number,
    recipeId: number,
    cantidad: number,
    senal?: AbortSignal,
  ): Promise<NecesidadesProduccion> {
    let q = supabase.rpc('fn_produccion_necesidades', {
      p_org: organizationId,
      p_branch: branchId,
      p_recipe_id: recipeId,
      p_qty: cantidad,
    });
    if (senal) q = q.abortSignal(senal);
    const { data, error } = await q;
    if (error) throw new ErrorProduccion(error);
    return aNecesidades(data) as NecesidadesProduccion;
  }

  async guardar(organizationId: number, orden: OrdenGuardar, clave: string | null): Promise<ResultadoGuardarOrden> {
    const { data, error } = await supabase.rpc('fn_produccion_guardar', {
      p_org: organizationId,
      p_orden: orden,
      p_clave: clave,
    });
    if (error) throw new ErrorProduccion(error);
    const d = obj(data);
    return { id: num(d.id), numero: String(d.numero ?? ''), status: String(d.status) as ProductionOrderStatus, repetido: d.repetido === true };
  }

  async cambiarEstado(organizationId: number, id: number, accion: AccionProduccion, motivo?: string | null): Promise<ProductionOrderStatus | null> {
    const { data, error } = await supabase.rpc('fn_produccion_cambiar_estado', {
      p_org: organizationId,
      p_id: id,
      p_accion: accion,
      p_motivo: motivo ?? null,
    });
    if (error) throw new ErrorProduccion(error);
    const d = obj(data);
    return d.eliminada === true ? null : (String(d.status) as ProductionOrderStatus);
  }

  /**
   * Completa la orden en UNA transacción (`complete_production_order` v2). Sin
   * `confirmarFaltante`, si algún ingrediente no alcanza responde
   * `faltante_sin_confirmar` con la lista (ver `ErrorProduccion.faltantes`).
   * Si falla, la orden sigue como estaba: no hay respaldo.
   */
  async completar(
    orderId: number,
    cantidadProducida: number,
    opciones: { confirmarFaltante?: boolean; clave?: string | null } = {},
  ): Promise<ResultadoCompletar> {
    const { data, error } = await supabase.rpc('complete_production_order', {
      p_order_id: orderId,
      p_produced_qty: cantidadProducida,
      p_updated_by: null,
      p_confirmar_faltante: opciones.confirmarFaltante ?? false,
      p_clave: opciones.clave ?? null,
    });
    if (error) throw new ErrorProduccion(error);
    const d = obj(data);
    return {
      success: d.success === true,
      order_id: num(d.order_id),
      produced_qty: num(d.produced_qty),
      ya_completada: d.ya_completada === true,
      ingredients_processed: numONull(d.ingredients_processed) ?? undefined,
      movement_id: numONull(d.movement_id) ?? undefined,
      total_cost: numONull(d.total_cost),
      unit_cost: numONull(d.unit_cost),
      avg_cost_after: numONull(d.avg_cost_after),
    };
  }
}

export const productionOrderService = new ProductionOrderService();

// ─── Pestaña «Producción» del detalle de producto (fn_producto_produccion_resumen) ──

export interface ResumenProduccionProducto {
  producto: { id: number; nombre: string; unidad: string; track_stock: boolean; es_padre: boolean; parent_product_id: number | null; modo: 'al_producir' | 'al_vender'; decimales: number };
  /** La receta que usa hoy (propia o, en una variante sin receta, la del padre). */
  receta_efectiva: { recipe_id: number; product_id: number; heredada: boolean; al_producir: boolean; version: number } | null;
  receta_propia: { recipe_id: number; version: number; nombre: string | null; creada_en: string | null } | null;
  versiones: number;
  variantes_con_receta: { product_id: number; nombre: string; recipe_id: number; version: number }[];
  usado_en: { recipe_id: number; product_id: number; producto: string; version: number }[];
  usado_en_total: number;
  ordenes: number;
  ordenes_abiertas: number;
  traslados: number;
  movimientos_produccion: number;
  conversiones: { id: number; de: string; a: string; factor: number; alcance: 'global' | 'organizacion' }[];
  /** Compuesto, con receta, ingrediente de otra receta u órdenes: la pestaña tiene contenido. */
  mostrar: boolean;
  permisos: PermisosInventario;
  editar_receta: boolean;
}

export interface TrasladoProducto {
  id: number;
  codigo: string;
  estado: string;
  origen: { id: number; nombre: string };
  destino: { id: number; nombre: string };
  enviado: number;
  recibido: number;
  orden_produccion: { id: number; numero: string } | null;
  creado_en: string | null;
}

export function aResumenProduccion(v: unknown): ResumenProduccionProducto {
  const d = obj(v);
  const p = obj(d.producto);
  const ef = d.receta_efectiva ? obj(d.receta_efectiva) : null;
  const pr = d.receta_propia ? obj(d.receta_propia) : null;
  const lista = (x: unknown) => (Array.isArray(x) ? (x as unknown[]).map(obj) : []);
  return {
    producto: {
      id: num(p.id),
      nombre: String(p.nombre ?? ''),
      unidad: String(p.unidad ?? 'UN').trim() || 'UN',
      track_stock: p.track_stock === true,
      es_padre: p.es_padre === true,
      parent_product_id: numONull(p.parent_product_id),
      modo: p.modo === 'al_producir' ? 'al_producir' : 'al_vender',
      decimales: num(p.decimales),
    },
    receta_efectiva: ef
      ? { recipe_id: num(ef.recipe_id), product_id: num(ef.product_id), heredada: ef.heredada === true, al_producir: ef.al_producir === true, version: num(ef.version) || 1 }
      : null,
    receta_propia: pr ? { recipe_id: num(pr.recipe_id), version: num(pr.version) || 1, nombre: textoONull(pr.nombre), creada_en: textoONull(pr.creada_en) } : null,
    versiones: num(d.versiones),
    variantes_con_receta: lista(d.variantes_con_receta).map((x) => ({ product_id: num(x.product_id), nombre: String(x.nombre ?? ''), recipe_id: num(x.recipe_id), version: num(x.version) || 1 })),
    usado_en: lista(d.usado_en).map((x) => ({ recipe_id: num(x.recipe_id), product_id: num(x.product_id), producto: String(x.producto ?? ''), version: num(x.version) || 1 })),
    usado_en_total: num(d.usado_en_total),
    ordenes: num(d.ordenes),
    ordenes_abiertas: num(d.ordenes_abiertas),
    traslados: num(d.traslados),
    movimientos_produccion: num(d.movimientos_produccion),
    conversiones: lista(d.conversiones).map((x) => ({
      id: num(x.id),
      de: String(x.de ?? '').trim(),
      a: String(x.a ?? '').trim(),
      factor: num(x.factor),
      alcance: x.alcance === 'global' ? 'global' : 'organizacion',
    })),
    mostrar: d.mostrar === true,
    permisos: d.permisos ? aPermisosInventario(d.permisos) : SIN_PERMISOS_INVENTARIO,
    editar_receta: d.editar_receta === true,
  };
}

export async function resumenProduccionProducto(organizationId: number, productId: number, senal?: AbortSignal): Promise<ResumenProduccionProducto> {
  let q = supabase.rpc('fn_producto_produccion_resumen', { p_org: organizationId, p_product: productId });
  if (senal) q = q.abortSignal(senal);
  const { data, error } = await q;
  if (error) throw new ErrorProduccion(error);
  return aResumenProduccion(data);
}

export async function distribucionProducto(organizationId: number, productId: number, senal?: AbortSignal): Promise<TrasladoProducto[]> {
  let q = supabase.rpc('fn_producto_distribucion', { p_org: organizationId, p_product: productId, p_limite: 100 });
  if (senal) q = q.abortSignal(senal);
  const { data, error } = await q;
  if (error) throw new ErrorProduccion(error);
  return (Array.isArray(data) ? (data as unknown[]) : []).map((x) => {
    const t = obj(x);
    const op = t.orden_produccion ? obj(t.orden_produccion) : null;
    return {
      id: num(t.id),
      codigo: String(t.codigo ?? ''),
      estado: String(t.estado ?? ''),
      origen: { id: num(obj(t.origen).id), nombre: String(obj(t.origen).nombre ?? '') },
      destino: { id: num(obj(t.destino).id), nombre: String(obj(t.destino).nombre ?? '') },
      enviado: num(t.enviado),
      recibido: num(t.recibido),
      orden_produccion: op ? { id: num(op.id), numero: String(op.numero ?? '') } : null,
      creado_en: textoONull(t.creado_en),
    };
  });
}
