/**
 * Aritmética de días calendario (YYYY-MM-DD). No convierte zonas: el día
 * ya viene resuelto en la zona de la organización.
 */

import { previousPlainDay } from '@/lib/utils/dateCore';

export function diaAnterior(iso: string): string {
  return previousPlainDay(iso);
}

function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** El mismo día del año anterior. El 29 de febrero cae en el 28. */
export function restarAnio(iso: string): string {
  const [anio, mes, dia] = iso.split('-').map(Number);
  const destino = anio - 1;
  const diaTope = Math.min(dia, ultimoDiaDelMes(destino, mes));
  const mm = String(mes).padStart(2, '0');
  const dd = String(diaTope).padStart(2, '0');
  return `${destino}-${mm}-${dd}`;
}

export function anioDe(iso: string): number {
  return Number(iso.slice(0, 4));
}

export function cierreDiciembre(anio: number): string {
  return `${anio}-12-31`;
}
