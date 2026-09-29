/**
 * Kardex (bloque B1, INVENTARIO-PLAN.md §5.2): fachada de RPC.
 *
 * Antes el kardex leía `stock_movements` sin `.range()` (el saldo mentía pasadas
 * 1.000 filas) y calculaba el saldo en el navegador. Ahora:
 *
 *   fn_kardex_saldo_corrido → listarKardex   saldo corrido por producto sobre TODA la
 *                                            historia del alcance, paginado, con KPI
 *                                            y el cuadre contra existencias.
 *   fn_kardex_descuadres    → descuadres     pares (producto, sucursal) cuyo kardex
 *                                            no cuadra (D2) y filas sin historia (D3).
 *
 * Permiso `ver`; costos solo con `costos`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/config';
import {
  aKpisMovimientos,
  aMovimientoFila,
  type FiltrosMovimientos,
  type KpisMovimientos,
  type MovimientoFila,
} from './stockService';

type ClienteRpc = Pick<SupabaseClient, 'rpc'>;

export type FiltrosKardex = FiltrosMovimientos;

export interface ParDescuadre {
  product_id: number;
  nombre: string;
  sku: string | null;
  branch_id: number;
  sucursal: string;
  saldo_kardex: number;
  existencia: number;
  /** existencia − saldo del kardex: positivo = faltan movimientos de entrada. */
  diferencia: number;
  ultimo_movimiento: string | null;
}

export interface Descuadres {
  total: number;
  diferencia_total: number;
  saldo_kardex: number;
  existencias: number;
  sin_historia: number;
  pares: ParDescuadre[];
}

export interface KpisKardex extends KpisMovimientos {
  saldo_cierre: number;
  existencias: number;
  valor: number | null;
  costo_promedio: number | null;
}

export interface RespuestaKardex {
  filas: MovimientoFila[];
  total: number;
  kpis: KpisKardex;
  cuadre: Descuadres;
  costos: boolean;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numONull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));

export function aDescuadres(data: unknown): Descuadres {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    total: num(d.total),
    diferencia_total: num(d.diferencia_total),
    saldo_kardex: num(d.saldo_kardex),
    existencias: num(d.existencias),
    sin_historia: num(d.sin_historia),
    pares: (Array.isArray(d.pares) ? (d.pares as Record<string, unknown>[]) : []).map((p) => ({
      product_id: num(p.product_id),
      nombre: String(p.nombre ?? ''),
      sku: (p.sku as string | null) ?? null,
      branch_id: num(p.branch_id),
      sucursal: String(p.sucursal ?? ''),
      saldo_kardex: num(p.saldo_kardex),
      existencia: num(p.existencia),
      diferencia: num(p.diferencia),
      ultimo_movimiento: (p.ultimo_movimiento as string | null) ?? null,
    })),
  };
}

export function aRespuestaKardex(data: unknown): RespuestaKardex {
  const d = (data ?? {}) as Record<string, unknown>;
  const k = (d.kpis ?? {}) as Record<string, unknown>;
  return {
    total: num(d.total),
    costos: d.costos === true,
    kpis: {
      ...aKpisMovimientos(k),
      saldo_cierre: num(k.saldo_cierre),
      existencias: num(k.existencias),
      valor: numONull(k.valor),
      costo_promedio: numONull(k.costo_promedio),
    },
    cuadre: aDescuadres(d.cuadre),
    filas: (Array.isArray(d.filas) ? (d.filas as Record<string, unknown>[]) : []).map(aMovimientoFila),
  };
}

function filtrosJson(filtros: FiltrosKardex): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor === undefined || valor === null || valor === '') continue;
    if (Array.isArray(valor) && valor.length === 0) continue;
    salida[clave] = valor;
  }
  return salida;
}

export async function listarKardex(
  organizacionId: number,
  filtros: FiltrosKardex,
  desde = 0,
  limite = 25,
  cliente: ClienteRpc = supabase,
): Promise<RespuestaKardex> {
  const { data, error } = await cliente.rpc('fn_kardex_saldo_corrido', {
    p_org: organizacionId,
    p_filtros: filtrosJson(filtros),
    p_desde: desde,
    p_limite: limite,
  });
  if (error) throw error;
  return aRespuestaKardex(data);
}

export async function descuadres(
  organizacionId: number,
  filtros: Pick<FiltrosKardex, 'sucursales' | 'producto'>,
  limite = 100,
  cliente: ClienteRpc = supabase,
): Promise<Descuadres> {
  const { data, error } = await cliente.rpc('fn_kardex_descuadres', {
    p_org: organizacionId,
    p_filtros: filtrosJson(filtros),
    p_limite: limite,
  });
  if (error) throw error;
  return aDescuadres(data);
}

export const kardexService = { listarKardex, descuadres };
