/**
 * Reservas de stock de la tienda web «huérfanas»: stock reservado
 * (`stock_levels.qty_reserved > 0`) que lleva más de 24 h sin moverse, síntoma
 * de un pedido abandonado cuyo stock no se liberó.
 *
 * Regla única: la usan el panel de observabilidad de Pedidos online
 * (`/api/web-orders/observability`) y la casilla «Reservas de stock sin mover»
 * del bloque «Hoy» del inicio (`bloqueHoy.server.ts`). Antes el umbral vivía
 * suelto dentro de la ruta.
 */

export const HORAS_RESERVA_HUERFANA = 24;
export const MS_RESERVA_HUERFANA = HORAS_RESERVA_HUERFANA * 60 * 60 * 1000;

/** ¿La reserva lleva más del umbral sin moverse? (`updated_at` de `stock_levels`). */
export function esReservaHuerfana(actualizadaEn: string | null | undefined, ahoraMs: number): boolean {
  if (!actualizadaEn) return false;
  const t = Date.parse(actualizadaEn);
  return Number.isFinite(t) && ahoraMs - t > MS_RESERVA_HUERFANA;
}

/** Instante antes del cual una reserva es huérfana (filtro `updated_at <`). */
export function limiteReservaHuerfana(ahora: Date): string {
  return new Date(ahora.getTime() - MS_RESERVA_HUERFANA).toISOString();
}
