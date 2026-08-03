// ============================================================
// Motor de ejecución de reportes
// Orquesta la ejecución de reportes individuales y cierres consolidados
// ============================================================

import type { PeriodoCierre, ReportData, ReportDefinition } from './types';
import { getReporteById, getReportesVisibles } from './reportesCatalogo';

/**
 * Ejecuta un reporte individual por su ID.
 * Busca la definición en el catálogo y llama su función `fetch`.
 */
export async function ejecutarReporte(
  reportId: string,
  orgId: number,
  periodo: PeriodoCierre,
): Promise<ReportData> {
  const def = getReporteById(reportId);

  if (!def) {
    throw new Error(`Reporte no encontrado: ${reportId}`);
  }

  try {
    const data = await def.fetch(orgId, periodo);
    return data;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error desconocido';
    throw new Error(`Error ejecutando reporte "${def.titulo}": ${msg}`);
  }
}

/**
 * Ejecuta todos los reportes de los módulos activos en paralelo
 * (con límite de concurrencia). Base del PDF de cierre consolidado.
 *
 * @param orgId ID de la organización
 * @param periodo Período de cierre a ejecutar
 * @param activeModuleCodes Códigos de módulos activos
 * @param concurrencyLimit Máximo de reportes en paralelo (default: 4)
 * @returns Array de ReportData exitosos + array de errores
 */
export async function ejecutarCierre(
  orgId: number,
  periodo: PeriodoCierre,
  activeModuleCodes: string[],
  concurrencyLimit: number = 4,
): Promise<{ resultados: ReportData[]; errores: { reportId: string; titulo: string; error: string }[] }> {
  const modulosVisibles = getReportesVisibles(activeModuleCodes);
  const todasDefiniciones: ReportDefinition[] = modulosVisibles.flatMap((m) => m.reportes);

  const resultados: ReportData[] = [];
  const errores: { reportId: string; titulo: string; error: string }[] = [];

  // Ejecutar en lotes con concurrencia limitada
  for (let i = 0; i < todasDefiniciones.length; i += concurrencyLimit) {
    const lote = todasDefiniciones.slice(i, i + concurrencyLimit);

    const promesas = lote.map(async (def) => {
      try {
        const data = await def.fetch(orgId, periodo);
        return { ok: true as const, data };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Error desconocido';
        return { ok: false as const, error: msg, reportId: def.id, titulo: def.titulo };
      }
    });

    const resultadosLote = await Promise.all(promesas);

    for (const r of resultadosLote) {
      if (r.ok) {
        resultados.push(r.data);
      } else {
        errores.push({ reportId: r.reportId, titulo: r.titulo, error: r.error });
      }
    }
  }

  return { resultados, errores };
}

/**
 * Ejecuta un conjunto específico de reportes por ID.
 * Útil para el agente IA que selecciona reportes específicos.
 */
export async function ejecutarReportesSeleccionados(
  reportIds: string[],
  orgId: number,
  periodo: PeriodoCierre,
  concurrencyLimit: number = 4,
): Promise<{ resultados: ReportData[]; errores: { reportId: string; titulo: string; error: string }[] }> {
  const resultados: ReportData[] = [];
  const errores: { reportId: string; titulo: string; error: string }[] = [];

  for (let i = 0; i < reportIds.length; i += concurrencyLimit) {
    const lote = reportIds.slice(i, i + concurrencyLimit);

    const promesas = lote.map(async (reportId) => {
      const def = getReporteById(reportId);
      if (!def) {
        return { ok: false as const, error: 'Reporte no encontrado', reportId, titulo: reportId };
      }
      try {
        const data = await def.fetch(orgId, periodo);
        return { ok: true as const, data };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Error desconocido';
        return { ok: false as const, error: msg, reportId, titulo: def.titulo };
      }
    });

    const resultadosLote = await Promise.all(promesas);

    for (const r of resultadosLote) {
      if (r.ok) {
        resultados.push(r.data);
      } else {
        errores.push({ reportId: r.reportId, titulo: r.titulo, error: r.error });
      }
    }
  }

  return { resultados, errores };
}
