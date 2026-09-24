// Lógica pura de Propinas: sin Supabase ni React, para poder probarla.

import { getDateRange } from '@/lib/utils/dateRanges';
import { TIP_TYPES, type Tip, type TipFilters, type TipStats, type TipSummary, type TipType } from './types';

export function esTipoPropina(valor: unknown): valor is TipType {
  return typeof valor === 'string' && (TIP_TYPES as readonly string[]).includes(valor);
}

function porTipoEnCero(): Record<TipType, number> {
  return { cash: 0, card: 0, transfer: 0, online: 0, split: 0, pooled: 0 };
}

/** Las anuladas no cuentan en ningún total. */
function vigentes(tips: Tip[]): Tip[] {
  return tips.filter((t) => !t.voided_at);
}

/** KPI de la cabecera a partir de las mismas propinas que muestra la tabla. */
export function calcularKpis(tips: Tip[]): TipStats {
  const stats: TipStats = { total: 0, distributed: 0, pending: 0, count: 0, byType: porTipoEnCero() };
  for (const tip of vigentes(tips)) {
    const monto = Number(tip.amount) || 0;
    stats.total += monto;
    stats.count += 1;
    if (tip.is_distributed) stats.distributed += monto;
    else stats.pending += monto;
    if (esTipoPropina(tip.tip_type)) stats.byType[tip.tip_type] += monto;
  }
  return stats;
}

const CAMPO_POR_TIPO: Record<TipType, keyof Pick<TipSummary,
  'cash_tips' | 'card_tips' | 'transfer_tips' | 'online_tips' | 'split_tips' | 'pooled_tips'>> = {
  cash: 'cash_tips',
  card: 'card_tips',
  transfer: 'transfer_tips',
  online: 'online_tips',
  split: 'split_tips',
  pooled: 'pooled_tips',
};

/** Resumen por mesero con los seis tipos. `sinNombre` es el texto traducido para quien no tiene nombre. */
export function resumirPorMesero(tips: Tip[], sinNombre = ''): TipSummary[] {
  const mapa: Record<string, TipSummary> = {};
  for (const tip of vigentes(tips)) {
    const id = tip.server_id;
    if (!mapa[id]) {
      const nombre = [tip.server?.first_name, tip.server?.last_name].filter(Boolean).join(' ');
      mapa[id] = {
        server_id: id,
        server_name: nombre || tip.server?.email || sinNombre,
        server_email: tip.server?.email || '',
        total_tips: 0,
        tips_count: 0,
        distributed_amount: 0,
        pending_amount: 0,
        cash_tips: 0,
        card_tips: 0,
        transfer_tips: 0,
        online_tips: 0,
        split_tips: 0,
        pooled_tips: 0,
      };
    }
    const fila = mapa[id];
    const monto = Number(tip.amount) || 0;
    fila.total_tips += monto;
    fila.tips_count += 1;
    if (tip.is_distributed) fila.distributed_amount += monto;
    else fila.pending_amount += monto;
    if (esTipoPropina(tip.tip_type)) fila[CAMPO_POR_TIPO[tip.tip_type]] += monto;
  }
  return Object.values(mapa).sort((a, b) => b.total_tips - a.total_tips);
}

/**
 * Filtro de fechas → instantes a pedirle a Supabase. Los días son de la zona
 * de la organización: «hasta 2026-09-23» en Bogotá termina a las 23:59:59.999
 * -05:00, no a medianoche UTC. Una sola punta: la otra queda abierta.
 */
export function rangoDeFiltros(
  filtros: Pick<TipFilters, 'dateFrom' | 'dateTo'>,
  zona: string,
): { desde?: string; hasta?: string } {
  const rango: { desde?: string; hasta?: string } = {};
  if (filtros.dateFrom) rango.desde = getDateRange(filtros.dateFrom, filtros.dateFrom, zona).start;
  if (filtros.dateTo) rango.hasta = getDateRange(filtros.dateTo, filtros.dateTo, zona).end;
  return rango;
}

/** Códigos de error que la pantalla sabe traducir (claves de `posPropinas.errores`). */
export const CODIGOS_ERROR_PROPINA = [
  'SIN_PERMISO',
  'PROPINA_DISTRIBUIDA',
  'PROPINA_ANULADA',
  'PROPINA_CON_ASIENTO',
  'PROPINA_INEXISTENTE',
  'PERIODO_CERRADO',
  'SIN_SUCURSAL',
  'DESCONOCIDO',
] as const;
export type CodigoErrorPropina = (typeof CODIGOS_ERROR_PROPINA)[number];

export class PropinaError extends Error {
  constructor(public readonly codigo: CodigoErrorPropina, detalle?: string) {
    super(detalle || codigo);
    this.name = 'PropinaError';
  }
}

/**
 * Traduce un error de Supabase/Postgres al código de la pantalla. Las RPC y la
 * guarda de la tabla levantan `CODIGO: detalle`; la RLS responde 42501.
 */
export function codigoErrorPropina(error: unknown): CodigoErrorPropina {
  if (error instanceof PropinaError) return error.codigo;
  const e = (error ?? {}) as { code?: string; message?: string };
  const mensaje = e.message || '';
  for (const codigo of CODIGOS_ERROR_PROPINA) {
    if (mensaje.startsWith(codigo) || mensaje.includes(`${codigo}:`)) return codigo;
  }
  if (e.code === '42501' || /row-level security|permission denied/i.test(mensaje)) return 'SIN_PERMISO';
  if (e.code === 'P0002') return 'PROPINA_INEXISTENTE';
  return 'DESCONOCIDO';
}

/** Error listo para lanzar desde el servicio. */
export function errorPropina(error: unknown): PropinaError {
  if (error instanceof PropinaError) return error;
  const mensaje = (error as { message?: string } | null)?.message;
  return new PropinaError(codigoErrorPropina(error), mensaje);
}
