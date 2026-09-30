/**
 * Lógica de `KpiMoneda` (Figma 759:22664). Sin React.
 *
 * Estados: `completo` (todo con tasa) · `falta tasa` (se suma lo que tiene tasa
 * y se avisa lo que quedó fuera) · `desglose` (por moneda, a un clic).
 */
import { localeIntl } from '@/components/kit/idioma';
import type { ResumenMonedaBase } from './monedaCrm';

export type EstadoKpiMoneda = 'completo' | 'faltaTasa';

export function estadoKpiMoneda(resumen: ResumenMonedaBase): EstadoKpiMoneda {
  return resumen.sinTasa.length > 0 ? 'faltaTasa' : 'completo';
}

/** Hay algo que desglosar: más de una moneda. */
export function tieneDesglose(resumen: ResumenMonedaBase): boolean {
  return resumen.grupos.length > 1;
}

/** Monedas sin tasa, en el orden en que se avisan («EUR, MXN»). */
export function monedasSinTasa(resumen: ResumenMonedaBase): string[] {
  return resumen.sinTasa.map((g) => g.moneda);
}

/** Oportunidades que quedaron fuera del total. */
export function cantidadSinTasa(resumen: ResumenMonedaBase): number {
  return resumen.sinTasa.reduce((s, g) => s + g.cantidad, 0);
}

/**
 * Fecha de la tasa que se informa: la más antigua de las usadas (si una
 * moneda usó una tasa vieja, eso es lo que hay que saber).
 */
export function fechaTasaInformada(resumen: ResumenMonedaBase): string | null {
  const fechas = resumen.convertidas.map((g) => g.fechaTasa).filter((f): f is string => !!f).sort();
  return fechas[0] ?? null;
}

/** Tasa legible en el idioma activo: «4.142,86» (2 decimales) o «0,000241» (6 cifras). */
export function formatearTasa(tasa: number | null | undefined, idioma: string): string {
  if (typeof tasa !== 'number' || !Number.isFinite(tasa)) return '—';
  const opciones: Intl.NumberFormatOptions = tasa >= 1 ? { maximumFractionDigits: 2 } : { maximumSignificantDigits: 6 };
  return new Intl.NumberFormat(localeIntl(idioma), opciones).format(tasa);
}
