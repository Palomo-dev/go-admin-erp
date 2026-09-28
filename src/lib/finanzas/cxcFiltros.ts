/**
 * Cuentas por cobrar: cómo viajan los filtros a `get_accounts_receivable_paginated`
 * y cómo se lee el estado que devuelve. Módulo hoja, sin dependencias.
 *
 * - El filtro «Cliente» de la pantalla es texto («Nombre del cliente»). Hasta
 *   2026-09-23 se mandaba a `customer_id_filter` (uuid) y la RPC fallaba con
 *   22P02: con ese filtro no se veía nada. Ahora un uuid va a
 *   `customer_id_filter` (el selector de cliente del diseño) y cualquier otro
 *   texto a `customer_search` (nombre o razón social).
 * - El estado vencido lo deriva el servidor al leer (`fn_cxc_estado_vivo`):
 *   una cuenta con abono (`partial`) y vencimiento pasado es «Vencida». Se usa
 *   `status_efectivo` y `dias_vencida`; `status`/`days_overdue` guardados solo
 *   se actualizan cuando algo toca la fila (no hay cron, C-2).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface FiltroClienteRpc {
  customer_id_filter: string | null;
  customer_search: string | null;
}

/** Traduce el valor del filtro «Cliente» a los dos parámetros de la RPC. */
export function filtroClienteCxC(cliente: string | null | undefined): FiltroClienteRpc {
  const valor = (cliente ?? '').trim();
  if (!valor) return { customer_id_filter: null, customer_search: null };
  if (UUID_RE.test(valor)) return { customer_id_filter: valor, customer_search: null };
  return { customer_id_filter: null, customer_search: valor.slice(0, 200) };
}

export type EstadoCxC = 'current' | 'overdue' | 'paid' | 'partial';

/** Estado y días vencidos vivos de una fila de la RPC (con respaldo a lo guardado). */
export function estadoVivoCxC(fila: {
  status: EstadoCxC;
  status_efectivo?: string | null;
  days_overdue?: number | null;
  dias_vencida?: number | null;
}): { status: EstadoCxC; days_overdue: number } {
  const efectivo = fila.status_efectivo;
  const status: EstadoCxC =
    efectivo === 'current' || efectivo === 'overdue' || efectivo === 'paid' || efectivo === 'partial'
      ? efectivo
      : fila.status;
  const dias = fila.dias_vencida ?? fila.days_overdue ?? 0;
  return { status, days_overdue: Number.isFinite(dias) ? Number(dias) : 0 };
}

/**
 * ¿Toca recordatorio? Nunca se ha enviado o el último fue hace 3 días o más.
 * `ahora` se inyecta para probarlo.
 */
export function tocaRecordatorio(ultimo: string | null | undefined, ahora: Date = new Date()): boolean {
  if (!ultimo) return true;
  const t = new Date(ultimo).getTime();
  if (Number.isNaN(t)) return true;
  return t <= ahora.getTime() - 3 * 24 * 60 * 60 * 1000;
}
