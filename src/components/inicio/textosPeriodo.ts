/**
 * Textos del periodo del inicio que dependen de la opción elegida: su nombre
 * (`home.periods.*`), contra qué se compara («frente a ayer a esta misma
 * hora», «frente a los 30 días anteriores») y la leyenda de las gráficas.
 * Claves, no textos: la pantalla las traduce.
 */
import type { PeriodoInicio } from '@/lib/dashboard/periodo';

export const CLAVE_PERIODO: Record<PeriodoInicio, 'today' | 'yesterday' | '7days' | '30days' | '90days' | 'year' | 'custom'> = {
  hoy: 'today',
  ayer: 'yesterday',
  '7d': '7days',
  '30d': '30days',
  '90d': '90days',
  año: 'year',
  personalizado: 'custom',
};

const DIAS: Partial<Record<PeriodoInicio, number>> = { '7d': 7, '30d': 30, '90d': 90 };

/** Clave bajo `home.ventasPeriodo.frente` y sus variables. */
export function claveComparacion(p: PeriodoInicio): { clave: string; params?: Record<string, number> } {
  if (p === 'hoy') return { clave: 'ayerMismaHora' };
  if (p === 'ayer') return { clave: 'anteayer' };
  if (p === 'año') return { clave: 'anioAnterior' };
  const dias = DIAS[p];
  return dias ? { clave: 'diasAnteriores', params: { n: dias } } : { clave: 'periodoAnterior' };
}

/** Leyenda de la gráfica (`home.ventasPeriodo.leyenda.*`): «Hoy / Ayer a la misma hora» o genérica. */
export function clavesLeyenda(p: PeriodoInicio): { actual: string; anterior: string } {
  return p === 'hoy' ? { actual: 'hoy', anterior: 'ayerMismaHora' } : { actual: 'actual', anterior: 'anterior' };
}
