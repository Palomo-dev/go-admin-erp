/**
 * Lógica pura de lotes y vencimientos, compartida por `kit/inventario/LotPicker`,
 * `BadgeVencimiento` y el selector de lote del POS (B9).
 *
 * Espejo del FEFO de `fn_inv_int_mover`: primero el lote que vence antes, los
 * sin vencimiento al final, a igualdad el de menor id; los vencidos se saltan
 * salvo que se pida lo contrario. La venta real la reparte el servidor: esto
 * solo propone el reparto que el cajero ve y puede cambiar.
 *
 * Fechas: `expiry_date` es una columna `date` (día calendario). Se compara como
 * texto `YYYY-MM-DD` contra `hoy`, que la pantalla obtiene con
 * `todayInTz(zonaDeLaOrganizacion)`. Nunca `new Date(...)` sobre la fecha.
 */
import type { EstadoVencimiento, LoteDisponible } from './tipos';

/** Días que se consideran «por vencer» si la pantalla no dice otra cosa (Figma 530:65092: 26 días = por vencer). */
export const UMBRAL_POR_VENCER_DIAS = 30;

const FECHA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function aDiaUtc(fecha: string): number | null {
  const m = FECHA_RE.exec(fecha);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000;
}

/** Días calendario de `desde` a `hasta` (negativo si `hasta` es anterior). null si alguna no es `YYYY-MM-DD`. */
export function diasEntre(desde: string, hasta: string): number | null {
  const a = aDiaUtc(desde);
  const b = aDiaUtc(hasta);
  if (a === null || b === null) return null;
  return Math.round(b - a);
}

export function estadoVencimiento(
  expiry: string | null | undefined,
  hoy: string,
  umbralDias: number = UMBRAL_POR_VENCER_DIAS,
): { estado: EstadoVencimiento; dias: number | null } {
  if (!expiry) return { estado: 'sin_vencimiento', dias: null };
  const dias = diasEntre(hoy, expiry);
  if (dias === null) return { estado: 'sin_vencimiento', dias: null };
  if (dias < 0) return { estado: 'vencido', dias };
  if (dias <= umbralDias) return { estado: 'por_vencer', dias };
  return { estado: 'vigente', dias };
}

/** Orden FEFO (no muta la lista). */
export function ordenarFefo<T extends Pick<LoteDisponible, 'lot_id' | 'expiry_date'>>(lotes: readonly T[]): T[] {
  return [...lotes].sort((a, b) => {
    if (a.expiry_date && b.expiry_date && a.expiry_date !== b.expiry_date) return a.expiry_date < b.expiry_date ? -1 : 1;
    if (a.expiry_date && !b.expiry_date) return -1;
    if (!a.expiry_date && b.expiry_date) return 1;
    return a.lot_id - b.lot_id;
  });
}

export interface AsignacionLote {
  lot_id: number;
  qty: number;
}

export interface RepartoFefo {
  asignaciones: AsignacionLote[];
  /** Lo que ningún lote cubre: sale de la existencia sin lote (o falta). */
  faltante: number;
}

/** Reparto sugerido de `cantidad` entre los lotes con existencia, por FEFO. */
export function repartirFefo(
  lotes: readonly LoteDisponible[],
  cantidad: number,
  hoy: string,
  opciones: { incluirVencidos?: boolean } = {},
): RepartoFefo {
  let resto = Math.max(0, Number(cantidad) || 0);
  const asignaciones: AsignacionLote[] = [];
  for (const lote of ordenarFefo(lotes)) {
    if (resto <= 0) break;
    if (lote.qty_on_hand <= 0) continue;
    if (!opciones.incluirVencidos && estadoVencimiento(lote.expiry_date, hoy).estado === 'vencido') continue;
    const toma = Math.min(resto, lote.qty_on_hand);
    asignaciones.push({ lot_id: lote.lot_id, qty: toma });
    resto = Math.round((resto - toma) * 1000) / 1000;
  }
  return { asignaciones, faltante: resto };
}

/** Total asignado en un reparto. */
export function totalAsignado(asignaciones: readonly AsignacionLote[]): number {
  return Math.round(asignaciones.reduce((s, a) => s + (Number(a.qty) || 0), 0) * 1000) / 1000;
}
