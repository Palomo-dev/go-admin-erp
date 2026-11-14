/**
 * Cómo se muestran las llaves de API en Desarrolladores (Figma 12.9). Puro, sin React:
 *  - permisos: los dos primeros y cuántos más («Leer productos, Leer pedidos +2»);
 *  - último uso: relativo y en el idioma de quien mira («hace 2 h», «ayer»).
 *
 * Lo relativo no depende de la zona horaria: es una diferencia entre dos instantes. Pasada una
 * semana se devuelve `null` y la pantalla usa la fecha con la zona de la organización.
 */

export function resumenAlcances(nombres: readonly string[], visibles = 2): { visibles: string[]; resto: number } {
  return { visibles: nombres.slice(0, visibles), resto: Math.max(0, nombres.length - visibles) };
}

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

export function tiempoRelativo(iso: string, idioma: string, ahora: number): string | null {
  const instante = Date.parse(iso);
  if (Number.isNaN(instante)) return null;
  const diferencia = ahora - instante;
  if (diferencia < 0 || diferencia >= 7 * DIA) return null;
  const formato = new Intl.RelativeTimeFormat(idioma, { numeric: 'auto', style: 'short' });
  if (diferencia < MINUTO) return formato.format(0, 'second');
  if (diferencia < HORA) return formato.format(-Math.floor(diferencia / MINUTO), 'minute');
  if (diferencia < DIA) return formato.format(-Math.floor(diferencia / HORA), 'hour');
  return formato.format(-Math.floor(diferencia / DIA), 'day');
}
