// ============================================================
// Alcance de sucursal de los reportes.
//
// Regla del dueño (2026-09-29): el reporte se filtra por sucursal, y el
// consolidado solo lo ve quien tiene acceso a todas las sucursales. Un gerente
// de una sede no ve las demás. La sucursal sale del selector del encabezado,
// igual que en POS y Productos.
//
// Esto decide qué ofrece la UI; la barrera está en el servidor
// (`reporte_exigir_alcance_sucursal` en cada `fn_reporte_*`), con la misma
// regla que `accesoTotal` de `GET /api/me/capacidades`.
// ============================================================

import type { ReportDefinition } from './types';

/**
 * Sucursal con la que se ejecutan los reportes.
 * Con acceso total se respeta el selector (null = consolidado). Sin él, el
 * modo «Todas» del selector se reduce a la sucursal concreta elegida: el
 * consolidado incluiría sucursales que no le corresponden.
 */
export function sucursalDeReportes(
  accesoTotal: boolean,
  branchFilter: number | null,
  selectedBranchId: number | null,
): number | null {
  if (accesoTotal) return branchFilter;
  return branchFilter ?? selectedBranchId;
}

/** ¿Puede ejecutarse el reporte con este acceso? */
export function reportePermitido(def: Pick<ReportDefinition, 'alcance'>, accesoTotal: boolean): boolean {
  return accesoTotal || def.alcance === 'sucursal';
}
