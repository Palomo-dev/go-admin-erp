import { rutaReporte } from '@/components/reportes/rutasReportes';

export const RUTA_PRESUPUESTOS = '/app/finanzas/presupuestos';

/** Informe del centro de reportes con lo real y la comparación por mes: no se recalcula en Finanzas. */
export const RUTA_PRESUPUESTO_VS_REAL = rutaReporte('contabilidad', 'presupuesto-vs-real');

export function rutaEditorPresupuesto(id: string): string {
  return `${RUTA_PRESUPUESTOS}/${encodeURIComponent(id)}`;
}
