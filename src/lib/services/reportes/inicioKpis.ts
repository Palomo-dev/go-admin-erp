/**
 * Cifras de la cabecera del centro de reportes (Figma 14 Reportes «Inicio»).
 * No hay una consulta propia: cada tarjeta es un KPI de un reporte del
 * catálogo, corrido con el periodo y la sucursal de la pantalla. Así la cifra
 * del inicio y la del visor del reporte son la misma siempre.
 *
 * Una tarjeta solo se pinta si su reporte está en el plan y la persona puede
 * abrirlo (`reportePermitido`); si no, se omite, no se inventa un cero.
 */
import { filtrosEfectivos, type FiltrosReportes } from './filtrosUrl';
import { periodoAnterior } from './periodosService';
import type { PeriodoCierre, ReportData, ReportDefinition, ReporteKPI } from './types';

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

/** Clave del resultado de «Ventas del periodo» sobre el periodo anterior (la tendencia de la tarjeta). */
export const CLAVE_VENTAS_ANTERIOR = 'ventas-periodo-anterior';

/** Una corrida de reporte para las tarjetas: con qué periodo y sucursal. */
export interface PeticionKpi {
  /** Clave del resultado: el id del reporte, o `CLAVE_VENTAS_ANTERIOR`. */
  clave: string;
  reportId: string;
  periodo: PeriodoCierre;
  sucursal: number | null;
}

/**
 * Corridas que piden las tarjetas, todas independientes entre sí. La de
 * ventas del periodo anterior va en el mismo lote: antes esperaba a que
 * terminaran las demás y sumaba tres viajes en serie al inicio.
 *
 * @param permitido El reporte está en el plan y la persona puede abrirlo.
 * @param sucursal Sucursal de la pantalla ya resuelta (`ctx.resolverSucursal`).
 */
export function planDeKpis(
  ids: readonly string[],
  filtros: FiltrosReportes,
  sucursal: number | null,
  definicion: (id: string) => ReportDefinition | undefined,
  permitido: (def: ReportDefinition) => boolean,
): PeticionKpi[] {
  const plan: PeticionKpi[] = [];
  for (const id of ids) {
    const def = definicion(id);
    if (!def || !permitido(def)) continue;
    const s = def.alcance === 'organizacion' ? null : sucursal;
    plan.push({ clave: id, reportId: id, periodo: filtrosEfectivos(def, filtros, s).periodo, sucursal: s });
  }
  const ventas = definicion('ventas-periodo');
  if (ventas && plan.some((p) => p.reportId === 'ventas-periodo')) {
    plan.push({
      clave: CLAVE_VENTAS_ANTERIOR,
      reportId: 'ventas-periodo',
      periodo: periodoAnterior(filtrosEfectivos(ventas, filtros, sucursal).periodo),
      sucursal,
    });
  }
  return plan;
}

/** Corre el plan en paralelo; una corrida que falla queda en `null` (la tarjeta muestra «—»). */
export async function correrKpis(
  plan: readonly PeticionKpi[],
  ejecutar: (p: PeticionKpi) => Promise<ReportData>,
): Promise<Map<string, ReportData | null>> {
  const resultados = await Promise.all(
    plan.map(async (p) => {
      try {
        return [p.clave, await ejecutar(p)] as const;
      } catch {
        return [p.clave, null] as const;
      }
    }),
  );
  return new Map(resultados);
}
