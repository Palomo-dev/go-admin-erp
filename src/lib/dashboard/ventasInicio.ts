/**
 * Tarjeta «Ventas del periodo» del inicio (Figma 445:137185; decisiones del
 * dueño V.9b y V.9c de PARIDAD-DASHBOARD-INICIO.md). Regla pura de
 * presentación sobre lo que devuelve `fn_inicio_ventas_periodo`:
 *
 * - Cifra: neto cobrado (criterio de caja) en la moneda de los cobros. Con
 *   cobros en MÁS de una moneda no se muestra importe (no se suman monedas).
 * - Variación contra el periodo anterior; sin base (anterior 0), neutra.
 * - Desglose: con una sucursal elegida, por canal (solo si hay más de uno);
 *   con «Todas», por sucursal (solo si hay más de una). Máximo tres + «otros».
 */

export interface DesgloseVenta {
  /** Canal (`pos`, `web`, `factura`, `mesa`…) o id de sucursal. */
  clave: string;
  total: number;
  otros?: boolean;
}

export const MAX_DESGLOSE = 3;

export function desgloseVentas(
  porCanal: Record<string, number> | undefined,
  porSucursal: Record<string, number> | undefined,
  unaSucursal: boolean,
): { tipo: 'canal' | 'sucursal'; filas: DesgloseVenta[] } | null {
  const fuente = unaSucursal ? porCanal : porSucursal;
  const filas: DesgloseVenta[] = Object.entries(fuente ?? {})
    .map(([clave, total]) => ({ clave, total: Number(total) || 0 }))
    .filter((f) => f.total !== 0)
    .sort((a, b) => b.total - a.total);
  if (filas.length < 2) return null;
  const visibles = filas.slice(0, MAX_DESGLOSE);
  const resto = filas.slice(MAX_DESGLOSE);
  if (resto.length > 0) visibles.push({ clave: 'otros', total: resto.reduce((s, f) => s + f.total, 0), otros: true });
  return { tipo: unaSucursal ? 'canal' : 'sucursal', filas: visibles };
}

/** Moneda en la que se puede mostrar el importe, o null si hay varias. */
export function monedaUnica(monedas: readonly string[] | undefined, base: string): string | null {
  const lista = (monedas ?? []).filter((m) => typeof m === 'string' && m !== '');
  if (lista.length > 1) return null;
  return lista[0] ?? base;
}
