// ============================================================
// Comparativo y lectura rápida, comunes a todos los reportes.
//
// El comparativo no es una consulta aparte: es el mismo reporte corrido con
// otro periodo. Aquí solo se cruzan los KPI por posición y título (los dos
// resultados salen del mismo `fetch`, así que traen los mismos KPI).
// ============================================================

import type { LecturaReporte, ReportData, ReporteKPI } from './types';

export interface VariacionKpi {
  titulo: string;
  actual: number | null;
  anterior: number | null;
  /** actual − anterior; null si alguno no es numérico. */
  diferencia: number | null;
  /** Variación relativa en %; null si el anterior es 0 o no es numérico. */
  porcentaje: number | null;
}

function numero(valor: ReporteKPI['valor'] | undefined): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor === 'string' && valor.trim() !== '' && Number.isFinite(Number(valor))) return Number(valor);
  return null;
}

export function compararKpis(actual: ReportData, anterior: ReportData | null): VariacionKpi[] {
  return actual.kpis.map((kpi, i) => {
    const mismoIndice = anterior?.kpis[i];
    const previo = mismoIndice?.titulo === kpi.titulo ? mismoIndice : anterior?.kpis.find((k) => k.titulo === kpi.titulo) ?? null;
    const a = numero(kpi.valor);
    const b = previo ? numero(previo.valor) : null;
    const diferencia = a !== null && b !== null ? a - b : null;
    const porcentaje = diferencia !== null && b !== null && b !== 0 ? (diferencia / Math.abs(b)) * 100 : null;
    return { titulo: kpi.titulo, actual: a, anterior: b, diferencia, porcentaje };
  });
}

/** Umbral de variación (%) a partir del cual el cambio se menciona en la lectura. */
export const UMBRAL_VARIACION = 15;

/**
 * Lectura rápida genérica: lo que dice el propio resultado. Los reportes
 * pueden traer la suya (`ReportData.lectura`), que va primero.
 * Los textos son en español y con cifras ya calculadas: el visor los muestra
 * tal cual y el documento de cierre los congela.
 */
export function lecturaDelReporte(
  actual: ReportData,
  variaciones: VariacionKpi[] | null,
  etiquetaComparado: string | null,
): LecturaReporte[] {
  const lectura: LecturaReporte[] = [...(actual.lectura ?? [])];

  if (actual.filas.length === 0 && actual.kpis.every((k) => !numero(k.valor))) {
    lectura.push({ tono: 'info', texto: 'No hay movimientos en este periodo.' });
    return lectura;
  }

  if (variaciones && etiquetaComparado) {
    const relevantes = variaciones
      .filter((v) => v.porcentaje !== null && Math.abs(v.porcentaje) >= UMBRAL_VARIACION)
      .sort((x, y) => Math.abs(y.porcentaje!) - Math.abs(x.porcentaje!))
      .slice(0, 3);
    for (const v of relevantes) {
      const sube = v.porcentaje! > 0;
      lectura.push({
        tono: 'info',
        texto: `${v.titulo} ${sube ? 'sube' : 'baja'} ${Math.abs(v.porcentaje!).toFixed(1).replace('.', ',')} % frente a ${etiquetaComparado}.`,
      });
    }
  }

  return lectura;
}
