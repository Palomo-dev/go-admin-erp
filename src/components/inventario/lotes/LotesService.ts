/**
 * Lotes (bloque B1, INVENTARIO-PLAN.md §5.2 y §2 F6): fachada de RPC.
 *
 * Antes escribía `lots` y `stock_levels` desde el navegador (guardarraíl 33) con
 * `stock_quantity: 0` cableado. Ahora:
 *
 *   fn_lotes_listado     → listarLotes      una fila por (lote, sucursal), estado de
 *                                           vencimiento en el día de la organización
 *   fn_lotes_de_producto → lotesDeProducto  para el LotPicker de los diálogos
 *   fn_lote_guardar      → guardarLote      alta/edición; la cantidad inicial entra por
 *                                           fn_stock_registrar_movimiento (ajuste + kardex)
 *   fn_lote_ajustar      → ajustarLote      fija la cantidad en una sucursal
 *   fn_lote_eliminar     → eliminarLote     solo sin existencias ni historia
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/config';
import type { LoteDisponible, ParamsLoteGuardar } from '@/lib/inventario/nucleo/tipos';
import type { EstadoLote, FiltrosLotes, LoteFila, RespuestaLotes } from './types';
import { ESTADOS_LOTE } from './types';

type ClienteRpc = Pick<SupabaseClient, 'rpc'>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numONull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));

export function aLoteFila(f: Record<string, unknown>): LoteFila {
  return {
    lot_id: num(f.lot_id),
    lot_code: String(f.lot_code ?? ''),
    creado: String(f.creado ?? ''),
    expiry_date: (f.expiry_date as string | null) ?? null,
    dias: numONull(f.dias),
    estado: (ESTADOS_LOTE as readonly string[]).includes(String(f.estado)) ? (f.estado as EstadoLote) : 'sin_vencimiento',
    notas: (f.notas as string | null) ?? null,
    product_id: num(f.product_id),
    nombre: String(f.nombre ?? ''),
    sku: (f.sku as string | null) ?? null,
    unidad: typeof f.unidad === 'string' ? f.unidad.trim() || null : null,
    atributos: (f.atributos as string | null) || null,
    branch_id: f.branch_id == null ? null : num(f.branch_id),
    sucursal: (f.sucursal as string | null) ?? null,
    qty_on_hand: num(f.qty_on_hand),
    qty_reserved: num(f.qty_reserved),
    costo_promedio: numONull(f.costo_promedio),
    valor: numONull(f.valor),
    supplier_id: f.supplier_id == null ? null : num(f.supplier_id),
    proveedor: (f.proveedor as string | null) ?? null,
    con_historia: f.con_historia === true,
  };
}

export function aRespuestaLotes(data: unknown): RespuestaLotes {
  const d = (data ?? {}) as Record<string, unknown>;
  const k = (d.kpis ?? {}) as Record<string, unknown>;
  return {
    total: num(d.total),
    costos: d.costos === true,
    hoy: String(d.hoy ?? ''),
    umbral: num(d.umbral) || 30,
    kpis: {
      lotes: num(k.lotes),
      vigentes: num(k.vigentes),
      uds_vigentes: num(k.uds_vigentes),
      por_vencer: num(k.por_vencer),
      uds_por_vencer: num(k.uds_por_vencer),
      vencidos: num(k.vencidos),
      uds_vencidas: num(k.uds_vencidas),
      valor_vencido: numONull(k.valor_vencido),
      valor_riesgo: numONull(k.valor_riesgo),
      uds: num(k.uds),
    },
    filas: (Array.isArray(d.filas) ? (d.filas as Record<string, unknown>[]) : []).map(aLoteFila),
  };
}

function filtrosJson(filtros: FiltrosLotes): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor === undefined || valor === null || valor === '') continue;
    if (Array.isArray(valor) && valor.length === 0) continue;
    salida[clave] = valor;
  }
  return salida;
}

export async function listarLotes(
  organizacionId: number,
  filtros: FiltrosLotes,
  desde = 0,
  limite = 25,
  cliente: ClienteRpc = supabase,
): Promise<RespuestaLotes> {
  const { data, error } = await cliente.rpc('fn_lotes_listado', {
    p_org: organizacionId,
    p_filtros: filtrosJson(filtros),
    p_desde: desde,
    p_limite: limite,
  });
  if (error) throw error;
  return aRespuestaLotes(data);
}

export async function lotesDeProducto(
  organizacionId: number,
  productoId: number,
  sucursalId: number | null,
  cliente: ClienteRpc = supabase,
): Promise<LoteDisponible[]> {
  const { data, error } = await cliente.rpc('fn_lotes_de_producto', {
    p_org: organizacionId,
    p_product: productoId,
    p_branch: sucursalId,
  });
  if (error) throw error;
  return (Array.isArray(data) ? (data as Record<string, unknown>[]) : []).map((l) => ({
    lot_id: num(l.lot_id),
    lot_code: String(l.lot_code ?? ''),
    expiry_date: (l.expiry_date as string | null) ?? null,
    qty_on_hand: num(l.qty_on_hand),
  }));
}

/** Contrato de B0 (`ParamsLoteGuardar`) con la entrada inicial opcional. */
export interface LoteAGuardar extends Omit<ParamsLoteGuardar['p_lote'], 'lot_code'> {
  /** Vacío: el servidor propone L-AAAAMMDD. */
  lot_code?: string | null;
  cantidad_inicial?: number | null;
  costo_unitario?: number | null;
  /** Motivo del ajuste de la entrada inicial (idioma del usuario). */
  motivo?: string | null;
  nota?: string | null;
}

export async function guardarLote(
  organizacionId: number,
  lote: LoteAGuardar,
  cliente: ClienteRpc = supabase,
): Promise<{ lot_id: number; lot_code: string; numero: string | null }> {
  const { data, error } = await cliente.rpc('fn_lote_guardar', { p_org: organizacionId, p_lote: lote });
  if (error) throw error;
  const d = (data ?? {}) as Record<string, unknown>;
  const mov = (d.movimiento ?? null) as Record<string, unknown> | null;
  return { lot_id: num(d.lot_id), lot_code: String(d.lot_code ?? ''), numero: (mov?.numero as string | null) ?? null };
}

export async function ajustarLote(
  organizacionId: number,
  loteId: number,
  sucursalId: number,
  cantidad: number,
  motivo: string,
  nota?: string | null,
  cliente: ClienteRpc = supabase,
): Promise<{ sin_cambio: boolean; numero: string | null; diferencia: number }> {
  const { data, error } = await cliente.rpc('fn_lote_ajustar', {
    p_org: organizacionId,
    p_lot: loteId,
    p_branch: sucursalId,
    p_cantidad: cantidad,
    p_motivo: motivo,
    p_nota: nota ?? null,
  });
  if (error) throw error;
  const d = (data ?? {}) as Record<string, unknown>;
  return { sin_cambio: d.sin_cambio === true, numero: (d.numero as string | null) ?? null, diferencia: num(d.diferencia) };
}

export async function eliminarLote(organizacionId: number, loteId: number, cliente: ClienteRpc = supabase): Promise<void> {
  const { error } = await cliente.rpc('fn_lote_eliminar', { p_org: organizacionId, p_lot: loteId });
  if (error) throw error;
}

export const LotesService = { listarLotes, lotesDeProducto, guardarLote, ajustarLote, eliminarLote };
