/**
 * Cifras de la cabecera del centro de reportes (Figma 14 Reportes «Inicio»).
 * No hay una consulta propia: cada tarjeta es un KPI de un reporte del
 * catálogo, corrido con el periodo y la sucursal de la pantalla. Así la cifra
 * del inicio y la del visor del reporte son la misma siempre.
 *
 * Una tarjeta solo se pinta si su reporte está en el plan y la persona puede
 * abrirlo (`reportePermitido`); si no, se omite, no se inventa un cero.
 */
import type { ReportData, ReporteKPI } from './types';

export type IdKpiInicio = 'ventas' | 'utilidad' | 'caja' | 'cobrar' | 'pagar' | 'inventario';

export interface FuenteKpiInicio {
  id: IdKpiInicio;
  reportId: string;
  /** Título del KPI en el reporte (los títulos del catálogo son estables). */
  kpi: string;
  /** Segundo dato de la tarjeta: otro KPI, del mismo reporte o de otro. */
  detalle?: { reportId: string; kpi: string };
  /** La tarjeta compara con el periodo anterior («↑ 8,4 % vs. agosto»). */
  comparar?: boolean;
}

export const KPIS_INICIO: readonly FuenteKpiInicio[] = [
  { id: 'ventas', reportId: 'ventas-periodo', kpi: 'Total Ventas', comparar: true },
  { id: 'utilidad', reportId: 'estado-resultados', kpi: 'Utilidad neta', detalle: { reportId: 'estado-resultados', kpi: 'Margen neto' } },
  { id: 'caja', reportId: 'caja-bancos-diario', kpi: 'Saldo final' },
  { id: 'cobrar', reportId: 'cxc-aging', kpi: 'Total CxC', detalle: { reportId: 'cxc-aging', kpi: 'Vencido' } },
  { id: 'pagar', reportId: 'cxp-aging', kpi: 'Total CxP', detalle: { reportId: 'cxp-aging', kpi: 'Vencido' } },
  { id: 'inventario', reportId: 'movimiento-valorizado', kpi: 'Valor final', detalle: { reportId: 'stock-critico', kpi: 'Bajo Mínimo' } },
];

/** Reportes distintos que hay que correr para las tarjetas dadas. */
export function reportesDeKpis(fuentes: readonly FuenteKpiInicio[]): string[] {
  const ids = new Set<string>();
  for (const f of fuentes) {
    ids.add(f.reportId);
    if (f.detalle) ids.add(f.detalle.reportId);
  }
  return [...ids];
}

/** KPI de un resultado por su título, o `null`. */
export function kpiDe(data: ReportData | null | undefined, titulo: string): ReporteKPI | null {
  return data?.kpis.find((k) => k.titulo === titulo) ?? null;
}

/** Valor numérico de un KPI, o `null` si no es un número. */
export function valorNumerico(k: ReporteKPI | null): number | null {
  if (!k) return null;
  if (typeof k.valor === 'number') return Number.isFinite(k.valor) ? k.valor : null;
  const n = Number(k.valor);
  return k.valor.trim() !== '' && Number.isFinite(n) ? n : null;
}
