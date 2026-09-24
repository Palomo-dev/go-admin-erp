/**
 * «hace 3 días», «in 2 hours», «il y a 5 mois»: tiempo relativo en el idioma
 * activo con `Intl.RelativeTimeFormat`. Puro (recibe «ahora») para poder
 * probarlo sin reloj.
 */
const UNIDADES: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];

export function tiempoRelativo(valor: string | Date | null | undefined, locale: string, ahora: number = Date.now()): string {
  if (!valor) return '';
  const fecha = typeof valor === 'string' ? new Date(valor) : valor;
  const ms = fecha.getTime();
  if (Number.isNaN(ms)) return '';
  const segundos = Math.round((ms - ahora) / 1000);
  const abs = Math.abs(segundos);
  const [unidad, tamano] = UNIDADES.find(([, s]) => abs >= s) ?? ['second', 1];
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(Math.round(segundos / tamano), unidad);
  } catch {
    return new Intl.RelativeTimeFormat('es-CO', { numeric: 'auto' }).format(Math.round(segundos / tamano), unidad);
  }
}
