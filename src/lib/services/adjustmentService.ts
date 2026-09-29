/**
 * Ajustes de inventario y ajuste por conteo (INVENTARIO-PLAN.md §5.3, bloque B2).
 *
 * Fachada de RPC: este archivo NO escribe tablas. Todo pasa por funciones SQL
 * SECURITY DEFINER que validan la organización (`fn_assert_acceso_org`) y el
 * permiso (`fn_inventario_exigir_permiso`), y que mueven el stock solo con la
 * primitiva del núcleo (`fn_inv_int_mover`):
 *
 *   fn_ajustes_listado   · listado paginado + KPI + permisos
 *   fn_ajuste_detalle    · cabecera, renglones, movimientos del kardex y asiento
 *   fn_ajuste_productos  · productos con su existencia por lote en la sucursal
 *   fn_ajuste_guardar    · crea o reemplaza un BORRADOR (no mueve stock)
 *   fn_ajuste_aplicar    · documento + movimientos + asiento único, en una transacción, idempotente
 *   fn_ajuste_descartar  · el borrador queda descartado con motivo (no se borra)
 *
 * Migraciones: supabase/migrations/20260929130*_inv_b2_*.sql.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/config';
import { aPermisosInventario, SIN_PERMISOS_INVENTARIO } from '@/lib/inventario/permisos';
import type { ErrorRpc } from '@/lib/inventario/nucleo/errores';
import type { PermisosInventario } from '@/lib/inventario/nucleo/tipos';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type EstadoAjuste = 'draft' | 'posted' | 'cancelled';
/** `conteo`: la cantidad es lo contado · `entrada`/`salida`: la cantidad es lo que entra o sale. */
export type ModoAjuste = 'conteo' | 'entrada' | 'salida';
/** Signo neto del documento (columna «Tipo» de Figma). */
export type TipoAjuste = 'entrada' | 'salida';

/** Razones (`inventory_adjustments.reason`). Las etiquetas salen de `inventarioAjustes.razones.<clave>`. */
export const RAZONES_AJUSTE = [
  'physical_count',
  'discrepancy',
  'damaged',
  'expired',
  'theft',
  'production_waste',
  'production_input',
  'initial_setup',
  'purchase_return',
  'audit',
  'system_error',
  'other',
] as const;
export type RazonAjuste = (typeof RAZONES_AJUSTE)[number];

/** Razón por defecto de cada modo (la primera que se ofrece). */
export const RAZON_POR_MODO: Record<ModoAjuste, RazonAjuste> = {
  conteo: 'physical_count',
  entrada: 'discrepancy',
  salida: 'damaged',
};

export interface SucursalRef {
  id: number;
  nombre: string;
}

export interface AjusteFila {
  id: number;
  codigo: string;
  /** Fecha del conteo (instante, timestamptz). */
  fecha: string;
  creado: string;
  aplicado: string | null;
  autor: string | null;
  sucursal: SucursalRef;
  tipo: TipoAjuste;
  modo: ModoAjuste;
  razon: string;
  notas: string | null;
  estado: EstadoAjuste;
  productos: number;
  diferencia: number;
  /** Unidad común de todos los renglones (`kg`), o null si se mezclan. */
  unidad: string | null;
  /** null sin permiso de costos. */
  impacto: number | null;
}

export interface KpisAjustes {
  total: number;
  mes: number;
  sucursales_mes: number;
  borradores: number;
  borrador_mas_antiguo_dias: number | null;
  aplicados: number;
  descartados: number;
  /** null sin permiso de costos. */
  impacto_mes: number | null;
}

export interface FiltrosAjustes {
  busqueda?: string;
  sucursal?: number | null;
  estados?: EstadoAjuste[];
  tipo?: TipoAjuste;
  razon?: string;
  /** Días calendario `YYYY-MM-DD` en la zona de la organización. */
  fecha_desde?: string;
  fecha_hasta?: string;
  orden?: 'fecha' | 'codigo' | 'impacto';
  direccion?: 'asc' | 'desc';
  desde?: number;
  limite?: number;
}

export interface ListadoAjustes {
  filas: AjusteFila[];
  total: number;
  kpis: KpisAjustes;
  permisos: PermisosInventario;
  /** Hoy en la zona de la organización (`YYYY-MM-DD`). */
  hoy: string;
  zona: string;
}

export interface ProductoRenglon {
  id: number;
  nombre: string;
  sku: string | null;
  unidad: string | null;
  controla_lotes: boolean;
  controla_serial: boolean;
}

export interface RenglonAjuste {
  id: number;
  producto: ProductoRenglon;
  lote: { id: number; codigo: string; vence: string | null } | null;
  /** Conteo: lo contado. Entrada/salida: lo que entra o sale. */
  cantidad: number;
  /** «Sistema al contar»: congelado al aplicar; en un borrador, el de cuando se guardó. */
  sistema: number;
  /** Solo en borradores: la existencia de hoy (para avisar si cambió desde el conteo). */
  sistema_actual: number | null;
  diferencia: number;
  costo: number | null;
  costo_ingresado: number | null;
  impacto: number | null;
  seriales: string[];
}

export interface MovimientoAjuste {
  id: number;
  fecha: string;
  producto: { id: number; nombre: string; sku: string | null; unidad: string | null };
  lote: string | null;
  direccion: 'in' | 'out';
  cantidad: number;
  costo: number | null;
  costo_promedio_despues: number | null;
  saldo_despues: number | null;
}

export interface CabeceraAjuste {
  id: number;
  codigo: string;
  estado: EstadoAjuste;
  modo: ModoAjuste;
  tipo: TipoAjuste;
  razon: string;
  notas: string | null;
  sucursal: SucursalRef;
  fecha: string;
  creado: string;
  creado_por: string | null;
  aplicado: string | null;
  aplicado_por: string | null;
  descartado: string | null;
  descartado_por: string | null;
  motivo_descarte: string | null;
}

export interface DetalleAjuste {
  ajuste: CabeceraAjuste;
  renglones: RenglonAjuste[];
  movimientos: MovimientoAjuste[];
  asiento: { id: number; fecha: string } | null;
  permisos: PermisosInventario;
}

export interface ExistenciaLote {
  lot_id: number | null;
  lote: string | null;
  /** Columna `date`: día calendario, sin zona. */
  vence: string | null;
  cantidad: number;
  costo_promedio: number | null;
}

export interface ProductoParaAjuste {
  id: number;
  nombre: string;
  sku: string | null;
  codigo_barras: string | null;
  unidad: string | null;
  /** Cómo se vende (`products.sale_mode`): 'unit' · 'weight' · 'measure'. */
  modo_venta?: string | null;
  /** Decimales de la cantidad del producto (0 por unidad, 3 por peso, 2 por medida; `fn_producto_decimales_cantidad`). */
  decimales_cantidad?: number | null;
  controla_lotes: boolean;
  controla_serial: boolean;
  existencias: ExistenciaLote[];
  lotes: { lot_id: number; lote: string; vence: string | null }[];
  costo_vigente: number | null;
  seriales_en_stock: string[];
}

export interface RenglonBorrador {
  product_id: number;
  lot_id?: number | null;
  quantity: number;
  unit_cost?: number | null;
  serial_numbers?: string[];
}

export interface BorradorAjuste {
  id?: number | null;
  branch_id: number;
  mode: ModoAjuste;
  reason: string;
  notes?: string | null;
  /** Instante ISO con offset (fecha y hora del conteo). */
  counted_at?: string | null;
  items: RenglonBorrador[];
}

export interface RecalculoAjuste {
  product_id: number;
  lot_id: number | null;
  nombre: string;
  sistema_al_guardar: number;
  sistema_al_aplicar: number;
  diferencia: number;
}

export interface ResultadoAplicar {
  ok: boolean;
  ya_aplicado: boolean;
  id: number;
  code: string;
  movimientos: number;
  recalculados: RecalculoAjuste[];
  valor_neto: number | null;
}

/** Error de una RPC de ajustes, con el código de negocio (`message`) y el SQLSTATE. */
export class ErrorAjuste extends Error implements ErrorRpc {
  readonly code: string | null;
  readonly details: string | null;
  constructor(error: ErrorRpc) {
    super(error.message ?? 'desconocido');
    this.name = 'ErrorAjuste';
    this.code = error.code ?? null;
    this.details = error.details ?? null;
  }
  get sinPermiso(): boolean {
    return this.code === '42501';
  }
  get noEncontrado(): boolean {
    return this.code === 'P0002' || this.message === 'ajuste_no_encontrado';
  }
}

// ─── Normalización ──────────────────────────────────────────────────────────

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numONull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : num(v));
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

function aFila(r: Record<string, unknown>): AjusteFila {
  const suc = (r.sucursal ?? {}) as Record<string, unknown>;
  return {
    id: num(r.id),
    codigo: String(r.codigo ?? `AJ-${r.id}`),
    fecha: String(r.fecha ?? r.creado ?? ''),
    creado: String(r.creado ?? ''),
    aplicado: texto(r.aplicado),
    autor: texto(r.autor),
    sucursal: { id: num(suc.id), nombre: String(suc.nombre ?? '') },
    tipo: r.tipo === 'salida' ? 'salida' : 'entrada',
    modo: (['conteo', 'entrada', 'salida'] as const).includes(r.modo as ModoAjuste) ? (r.modo as ModoAjuste) : 'conteo',
    razon: String(r.razon ?? ''),
    notas: texto(r.notas),
    estado: (['draft', 'posted', 'cancelled'] as const).includes(r.estado as EstadoAjuste) ? (r.estado as EstadoAjuste) : 'draft',
    productos: num(r.productos),
    diferencia: num(r.diferencia),
    unidad: texto(r.unidad),
    impacto: numONull(r.impacto),
  };
}

function aKpis(k: Record<string, unknown> | null | undefined): KpisAjustes {
  const x = k ?? {};
  return {
    total: num(x.total),
    mes: num(x.mes),
    sucursales_mes: num(x.sucursales_mes),
    borradores: num(x.borradores),
    borrador_mas_antiguo_dias: numONull(x.borrador_mas_antiguo_dias),
    aplicados: num(x.aplicados),
    descartados: num(x.descartados),
    impacto_mes: numONull(x.impacto_mes),
  };
}

function aRenglon(r: Record<string, unknown>): RenglonAjuste {
  const p = (r.producto ?? {}) as Record<string, unknown>;
  const l = r.lote as Record<string, unknown> | null;
  return {
    id: num(r.id),
    producto: {
      id: num(p.id),
      nombre: String(p.nombre ?? ''),
      sku: texto(p.sku),
      unidad: texto(p.unidad),
      controla_lotes: p.controla_lotes === true,
      controla_serial: p.controla_serial === true,
    },
    lote: l ? { id: num(l.id), codigo: String(l.codigo ?? ''), vence: texto(l.vence) } : null,
    cantidad: num(r.cantidad),
    sistema: num(r.sistema),
    sistema_actual: numONull(r.sistema_actual),
    diferencia: num(r.diferencia),
    costo: numONull(r.costo),
    costo_ingresado: numONull(r.costo_ingresado),
    impacto: numONull(r.impacto),
    seriales: Array.isArray(r.seriales) ? (r.seriales as unknown[]).map(String) : [],
  };
}

function aMovimiento(r: Record<string, unknown>): MovimientoAjuste {
  const p = (r.producto ?? {}) as Record<string, unknown>;
  return {
    id: num(r.id),
    fecha: String(r.fecha ?? ''),
    producto: { id: num(p.id), nombre: String(p.nombre ?? ''), sku: texto(p.sku), unidad: texto(p.unidad) },
    lote: texto(r.lote),
    direccion: r.direccion === 'out' ? 'out' : 'in',
    cantidad: num(r.cantidad),
    costo: numONull(r.costo),
    costo_promedio_despues: numONull(r.costo_promedio_despues),
    saldo_despues: numONull(r.saldo_despues),
  };
}

function aDetalle(d: Record<string, unknown>): DetalleAjuste {
  const a = (d.ajuste ?? {}) as Record<string, unknown>;
  const fila = aFila({ ...a, productos: 0, diferencia: 0 });
  const asiento = d.asiento as Record<string, unknown> | null;
  return {
    ajuste: {
      id: fila.id,
      codigo: fila.codigo,
      estado: fila.estado,
      modo: fila.modo,
      tipo: fila.tipo,
      razon: fila.razon,
      notas: fila.notas,
      sucursal: fila.sucursal,
      fecha: fila.fecha,
      creado: fila.creado,
      creado_por: texto(a.creado_por),
      aplicado: texto(a.aplicado),
      aplicado_por: texto(a.aplicado_por),
      descartado: texto(a.descartado),
      descartado_por: texto(a.descartado_por),
      motivo_descarte: texto(a.motivo_descarte),
    },
    renglones: Array.isArray(d.renglones) ? (d.renglones as Record<string, unknown>[]).map(aRenglon) : [],
    movimientos: Array.isArray(d.movimientos) ? (d.movimientos as Record<string, unknown>[]).map(aMovimiento) : [],
    asiento: asiento ? { id: num(asiento.id), fecha: String(asiento.fecha ?? '') } : null,
    permisos: d.permisos ? aPermisosInventario(d.permisos) : { ...SIN_PERMISOS_INVENTARIO, resueltos: true },
  };
}

function aProducto(r: Record<string, unknown>): ProductoParaAjuste {
  return {
    id: num(r.id),
    nombre: String(r.nombre ?? ''),
    sku: texto(r.sku),
    codigo_barras: texto(r.codigo_barras),
    unidad: texto(r.unidad),
    modo_venta: texto(r.modo_venta),
    decimales_cantidad: numONull(r.decimales_cantidad),
    controla_lotes: r.controla_lotes === true,
    controla_serial: r.controla_serial === true,
    existencias: Array.isArray(r.existencias)
      ? (r.existencias as Record<string, unknown>[]).map((e) => ({
          lot_id: e.lot_id === null || e.lot_id === undefined ? null : num(e.lot_id),
          lote: texto(e.lote),
          vence: texto(e.vence),
          cantidad: num(e.cantidad),
          costo_promedio: numONull(e.costo_promedio),
        }))
      : [],
    lotes: Array.isArray(r.lotes)
      ? (r.lotes as Record<string, unknown>[]).map((l) => ({ lot_id: num(l.lot_id), lote: String(l.lote ?? ''), vence: texto(l.vence) }))
      : [],
    costo_vigente: numONull(r.costo_vigente),
    seriales_en_stock: Array.isArray(r.seriales_en_stock) ? (r.seriales_en_stock as unknown[]).map(String) : [],
  };
}

// ─── Servicio ───────────────────────────────────────────────────────────────

type ClienteRpc = Pick<SupabaseClient, 'rpc'>;

async function llamar<T>(cliente: ClienteRpc, fn: string, args: Record<string, unknown>, senal?: AbortSignal): Promise<T> {
  const consulta = cliente.rpc(fn, args);
  const { data, error } = await (senal ? consulta.abortSignal(senal) : consulta);
  if (error) throw new ErrorAjuste(error);
  return data as T;
}

export function crearServicioAjustes(cliente: ClienteRpc = supabase) {
  return {
    async listar(org: number, filtros: FiltrosAjustes = {}, senal?: AbortSignal): Promise<ListadoAjustes> {
      const d = await llamar<Record<string, unknown>>(cliente, 'fn_ajustes_listado', { p_org: org, p_filtros: filtros }, senal);
      return {
        filas: Array.isArray(d?.filas) ? (d.filas as Record<string, unknown>[]).map(aFila) : [],
        total: num(d?.total),
        kpis: aKpis(d?.kpis as Record<string, unknown>),
        permisos: aPermisosInventario(d?.permisos),
        hoy: String(d?.hoy ?? ''),
        zona: String(d?.zona ?? ''),
      };
    },

    async detalle(org: number, id: number, senal?: AbortSignal): Promise<DetalleAjuste> {
      const d = await llamar<Record<string, unknown>>(cliente, 'fn_ajuste_detalle', { p_org: org, p_id: id }, senal);
      return aDetalle(d ?? {});
    },

    async productos(
      org: number,
      sucursal: number,
      opciones: { texto?: string; ids?: number[]; limite?: number } = {},
      senal?: AbortSignal,
    ): Promise<ProductoParaAjuste[]> {
      const d = await llamar<unknown[]>(
        cliente,
        'fn_ajuste_productos',
        {
          p_org: org,
          p_branch: sucursal,
          p_texto: opciones.texto ?? null,
          p_ids: opciones.ids && opciones.ids.length ? opciones.ids : null,
          p_limite: opciones.limite ?? 30,
        },
        senal,
      );
      return Array.isArray(d) ? (d as Record<string, unknown>[]).map(aProducto) : [];
    },

    async guardar(org: number, borrador: BorradorAjuste): Promise<{ id: number; code: string }> {
      const d = await llamar<{ id: number; code: string }>(cliente, 'fn_ajuste_guardar', { p_org: org, p_ajuste: borrador });
      return { id: num(d?.id), code: String(d?.code ?? '') };
    },

    async aplicar(org: number, id: number, clave: string): Promise<ResultadoAplicar> {
      const d = await llamar<Record<string, unknown>>(cliente, 'fn_ajuste_aplicar', {
        p_org: org,
        p_ajuste_id: id,
        p_clave_idempotencia: clave,
      });
      return {
        ok: d?.ok === true,
        ya_aplicado: d?.ya_aplicado === true,
        id: num(d?.id),
        code: String(d?.code ?? ''),
        movimientos: num(d?.movimientos),
        recalculados: Array.isArray(d?.recalculados)
          ? (d.recalculados as Record<string, unknown>[]).map((r) => ({
              product_id: num(r.product_id),
              lot_id: r.lot_id === null || r.lot_id === undefined ? null : num(r.lot_id),
              nombre: String(r.nombre ?? ''),
              sistema_al_guardar: num(r.sistema_al_guardar),
              sistema_al_aplicar: num(r.sistema_al_aplicar),
              diferencia: num(r.diferencia),
            }))
          : [],
        valor_neto: numONull(d?.valor_neto),
      };
    },

    async descartar(org: number, id: number, motivo: string): Promise<void> {
      await llamar(cliente, 'fn_ajuste_descartar', { p_org: org, p_ajuste_id: id, p_motivo: motivo });
    },
  };
}

export type ServicioAjustes = ReturnType<typeof crearServicioAjustes>;

export const adjustmentService: ServicioAjustes = crearServicioAjustes();
export default adjustmentService;
