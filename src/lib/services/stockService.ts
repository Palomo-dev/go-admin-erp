/**
 * Existencias y movimientos (bloque B1, INVENTARIO-PLAN.md §5.2): fachada de RPC.
 *
 * Nada se calcula ni se escribe desde el navegador. Cada función llama a una RPC
 * SECURITY DEFINER que valida la organización (`fn_assert_acceso_org`) y el
 * permiso (`fn_inventario_exigir_permiso`) y, si mueve stock, lo hace SOLO por la
 * primitiva `fn_inv_int_mover` (guardarraíl 33 de `src/__tests__/guardrails.test.ts`).
 *
 *   fn_stock_listado               → listarStock          (permiso ver)
 *   fn_movimientos_listado         → listarMovimientos    (permiso ver)
 *   fn_stock_registrar_movimiento  → registrarMovimiento  (permiso ajustar; documento de ajuste de B2)
 *   update_product_min_stock       → guardarMinimos       (permiso ajustar o editar_catalogo)
 *
 * Costos (costo promedio, valor, costo unitario) llegan `null` si el usuario no
 * tiene el permiso `costos`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/config';
import type { DireccionMovimiento, ParamsRegistrarMovimiento } from '@/lib/inventario/nucleo/tipos';

type ClienteRpc = Pick<SupabaseClient, 'rpc'>;

// ─── Stock ───────────────────────────────────────────────────────────────────

export const ESTADOS_STOCK = ['disponible', 'bajo_minimo', 'agotado', 'negativo'] as const;
export type EstadoStock = (typeof ESTADOS_STOCK)[number];

export const SEGUIMIENTOS_STOCK = ['lotes', 'seriales', 'sin'] as const;
export type SeguimientoStock = (typeof SEGUIMIENTOS_STOCK)[number];

export interface FiltrosStock {
  busqueda?: string;
  /** Sucursales del alcance; vacío o ausente = todas las de la organización. */
  sucursales?: readonly number[];
  estados?: readonly EstadoStock[];
  categoria?: number;
  seguimiento?: SeguimientoStock;
  proveedor?: number;
  /** El producto y sus variantes. */
  producto?: number;
  /** P1: true (defecto) suma las variantes bajo su padre. */
  agrupar?: boolean;
  orden?: 'producto' | 'disponible' | 'existencia';
  direccion?: 'asc' | 'desc';
}

export interface StockPorSucursal {
  branch_id: number;
  sucursal: string;
  existencia: number;
  reservado: number;
  disponible: number;
  minimo: number;
  negativo: boolean;
  /** Fila propia del padre en esta sucursal (P1). */
  sin_asignar: number;
}

export interface StockFila {
  product_id: number;
  nombre: string;
  sku: string | null;
  barcode: string | null;
  parent_id: number | null;
  /** «Negro / 42» (variant_data). */
  atributos: string | null;
  categoria: string | null;
  unidad: string | null;
  con_lotes: boolean;
  con_seriales: boolean;
  sigue_stock: boolean;
  variantes: number;
  /** agrupar = false: fila propia de un padre con variantes (P1). */
  sin_asignar_fila: boolean;
  existencia: number;
  reservado: number;
  disponible: number;
  minimo: number;
  lotes: number;
  /** Existencia propia del padre que no se suma (P1: «sin asignar a variante»). */
  sin_asignar: number;
  estado: EstadoStock;
  costo_promedio: number | null;
  valor: number | null;
  por_sucursal: StockPorSucursal[];
}

export interface KpisStock {
  productos: number;
  con_existencias: number;
  valor: number | null;
  bajo_minimo: number;
  agotados: number;
  negativos: number;
  sin_asignar: number;
}

export interface RespuestaStock {
  filas: StockFila[];
  total: number;
  kpis: KpisStock;
  costos: boolean;
  sucursales: number[];
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numONull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));

/** Normaliza la respuesta de `fn_stock_listado` (numeric llega como número o texto). */
export function aRespuestaStock(data: unknown): RespuestaStock {
  const d = (data ?? {}) as Record<string, unknown>;
  const k = (d.kpis ?? {}) as Record<string, unknown>;
  const filas = Array.isArray(d.filas) ? (d.filas as Record<string, unknown>[]) : [];
  return {
    total: num(d.total),
    costos: d.costos === true,
    sucursales: Array.isArray(d.sucursales) ? (d.sucursales as unknown[]).map(num) : [],
    kpis: {
      productos: num(k.productos),
      con_existencias: num(k.con_existencias),
      valor: numONull(k.valor),
      bajo_minimo: num(k.bajo_minimo),
      agotados: num(k.agotados),
      negativos: num(k.negativos),
      sin_asignar: num(k.sin_asignar),
    },
    filas: filas.map((f) => ({
      product_id: num(f.product_id),
      nombre: String(f.nombre ?? ''),
      sku: (f.sku as string | null) ?? null,
      barcode: (f.barcode as string | null) || null,
      parent_id: f.parent_id == null ? null : num(f.parent_id),
      atributos: (f.atributos as string | null) || null,
      categoria: (f.categoria as string | null) ?? null,
      unidad: typeof f.unidad === 'string' ? f.unidad.trim() || null : null,
      con_lotes: f.con_lotes === true,
      con_seriales: f.con_seriales === true,
      sigue_stock: f.sigue_stock !== false,
      variantes: num(f.variantes),
      sin_asignar_fila: f.sin_asignar_fila === true,
      existencia: num(f.existencia),
      reservado: num(f.reservado),
      disponible: num(f.disponible),
      minimo: num(f.minimo),
      lotes: num(f.lotes),
      sin_asignar: num(f.sin_asignar),
      estado: (ESTADOS_STOCK as readonly string[]).includes(String(f.estado)) ? (f.estado as EstadoStock) : 'disponible',
      costo_promedio: numONull(f.costo_promedio),
      valor: numONull(f.valor),
      por_sucursal: (Array.isArray(f.por_sucursal) ? (f.por_sucursal as Record<string, unknown>[]) : []).map((s) => ({
        branch_id: num(s.branch_id),
        sucursal: String(s.sucursal ?? ''),
        existencia: num(s.existencia),
        reservado: num(s.reservado),
        disponible: num(s.disponible),
        minimo: num(s.minimo),
        negativo: s.negativo === true,
        sin_asignar: num(s.sin_asignar),
      })),
    })),
  };
}

function filtrosJson<T extends object>(filtros: T): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor === undefined || valor === null || valor === '') continue;
    if (Array.isArray(valor) && valor.length === 0) continue;
    salida[clave] = valor;
  }
  return salida;
}

export async function listarStock(
  organizacionId: number,
  filtros: FiltrosStock,
  desde = 0,
  limite = 25,
  cliente: ClienteRpc = supabase,
): Promise<RespuestaStock> {
  const { data, error } = await cliente.rpc('fn_stock_listado', {
    p_org: organizacionId,
    p_filtros: filtrosJson(filtros),
    p_desde: desde,
    p_limite: limite,
  });
  if (error) throw error;
  return aRespuestaStock(data);
}

// ─── Movimientos ─────────────────────────────────────────────────────────────

export interface FiltrosMovimientos {
  busqueda?: string;
  sucursales?: readonly number[];
  /** Día `YYYY-MM-DD` en la zona de la organización (inclusive). */
  desde?: string;
  hasta?: string;
  direccion?: DireccionMovimiento;
  origenes?: readonly string[];
  producto?: number;
  lote?: number;
  usuario?: string;
  solo_ingredientes?: boolean;
  sin_documento?: boolean;
  direccion_orden?: 'asc' | 'desc';
}

export interface MovimientoFila {
  id: number;
  fecha: string;
  product_id: number;
  nombre: string;
  sku: string | null;
  unidad: string | null;
  parent_id: number | null;
  atributos: string | null;
  branch_id: number;
  sucursal: string;
  lot_id: number | null;
  lote: string | null;
  direccion: DireccionMovimiento;
  cantidad: number;
  costo_unitario: number | null;
  costo_total: number | null;
  costo_promedio_tras: number | null;
  source: string;
  source_id: string | null;
  nota: string | null;
  usuario_id: string | null;
  usuario: string | null;
  /** Solo en el kardex: saldo corrido del producto tras el movimiento. */
  saldo: number | null;
}

export interface KpisMovimientos {
  entradas: number;
  salidas: number;
  movimientos_entrada: number;
  movimientos_salida: number;
  valor_salidas: number | null;
  sin_documento: number;
}

export interface RespuestaMovimientos {
  filas: MovimientoFila[];
  total: number;
  kpis: KpisMovimientos;
  costos: boolean;
}

export function aMovimientoFila(f: Record<string, unknown>): MovimientoFila {
  return {
    id: num(f.id),
    fecha: String(f.fecha ?? ''),
    product_id: num(f.product_id),
    nombre: String(f.nombre ?? ''),
    sku: (f.sku as string | null) ?? null,
    unidad: typeof f.unidad === 'string' ? f.unidad.trim() || null : null,
    parent_id: f.parent_id == null ? null : num(f.parent_id),
    atributos: (f.atributos as string | null) || null,
    branch_id: num(f.branch_id),
    sucursal: String(f.sucursal ?? ''),
    lot_id: f.lot_id == null ? null : num(f.lot_id),
    lote: (f.lote as string | null) ?? null,
    direccion: f.direccion === 'in' ? 'in' : 'out',
    cantidad: num(f.cantidad),
    costo_unitario: numONull(f.costo_unitario),
    costo_total: numONull(f.costo_total),
    costo_promedio_tras: numONull(f.costo_promedio_tras),
    source: String(f.source ?? ''),
    source_id: f.source_id == null ? null : String(f.source_id),
    nota: (f.nota as string | null) ?? null,
    usuario_id: (f.usuario_id as string | null) ?? null,
    usuario: (f.usuario as string | null) ?? null,
    saldo: numONull(f.saldo),
  };
}

export function aKpisMovimientos(k: Record<string, unknown>): KpisMovimientos {
  return {
    entradas: num(k.entradas),
    salidas: num(k.salidas),
    movimientos_entrada: num(k.movimientos_entrada),
    movimientos_salida: num(k.movimientos_salida),
    valor_salidas: numONull(k.valor_salidas),
    sin_documento: num(k.sin_documento),
  };
}

export function aRespuestaMovimientos(data: unknown): RespuestaMovimientos {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    total: num(d.total),
    costos: d.costos === true,
    kpis: aKpisMovimientos((d.kpis ?? {}) as Record<string, unknown>),
    filas: (Array.isArray(d.filas) ? (d.filas as Record<string, unknown>[]) : []).map(aMovimientoFila),
  };
}

export async function listarMovimientos(
  organizacionId: number,
  filtros: FiltrosMovimientos,
  desde = 0,
  limite = 25,
  cliente: ClienteRpc = supabase,
): Promise<RespuestaMovimientos> {
  const { data, error } = await cliente.rpc('fn_movimientos_listado', {
    p_org: organizacionId,
    p_filtros: filtrosJson(filtros),
    p_desde: desde,
    p_limite: limite,
  });
  if (error) throw error;
  return aRespuestaMovimientos(data);
}

// ─── Escrituras (por RPC) ────────────────────────────────────────────────────

/** Contrato de B0 (`ParamsRegistrarMovimiento`) más la nota opcional. */
export interface ParamsRegistrarMovimientoB1 extends ParamsRegistrarMovimiento {
  p_nota?: string | null;
}

export interface ResultadoRegistrarMovimiento {
  ajuste_id: number;
  /** «AJ-0161»: el documento que el kardex enlaza. */
  numero: string | null;
}

export async function registrarMovimiento(
  params: ParamsRegistrarMovimientoB1,
  cliente: ClienteRpc = supabase,
): Promise<ResultadoRegistrarMovimiento> {
  const { data, error } = await cliente.rpc('fn_stock_registrar_movimiento', {
    p_org: params.p_org,
    p_branch: params.p_branch,
    p_product: params.p_product,
    p_lot: params.p_lot,
    p_direccion: params.p_direccion,
    p_qty: params.p_qty,
    p_costo: params.p_costo,
    p_motivo: params.p_motivo,
    p_nota: params.p_nota ?? null,
  });
  if (error) throw error;
  const d = (data ?? {}) as Record<string, unknown>;
  return { ajuste_id: num(d.ajuste_id), numero: (d.numero as string | null) ?? null };
}

export interface MinimoSucursal {
  product_id: number;
  branch_id: number;
  min_level: number;
}

/** Stock mínimo por (producto, sucursal). Un mínimo en 0 apaga el aviso. */
export async function guardarMinimos(items: readonly MinimoSucursal[], cliente: ClienteRpc = supabase): Promise<void> {
  if (items.length === 0) return;
  const { error } = await cliente.rpc('update_product_min_stock', { p_items: items });
  if (error) throw error;
}

export const stockService = {
  listarStock,
  listarMovimientos,
  registrarMovimiento,
  guardarMinimos,
};
