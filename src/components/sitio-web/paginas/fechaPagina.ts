/**
 * Columna «Actualizada» de Páginas (Figma A/04a): «Hoy, 10:12 a. m.», «Ayer» o «2 oct.», en la
 * zona horaria de la organización (regla de fechas: nada de `split('T')`). Pura.
 */
import { formatDateInTz, previousPlainDay, toPlainDate } from '@/lib/utils/dateDisplay';

export type FechaRelativa = { tipo: 'hoy'; hora: string } | { tipo: 'ayer' } | { tipo: 'fecha'; texto: string } | { tipo: 'sin' };

export function fechaRelativa(valor: string | null | undefined, zona: string, ahora: Date, locale: string): FechaRelativa {
  if (!valor) return { tipo: 'sin' };
  const instante = new Date(valor);
  if (isNaN(instante.getTime())) return { tipo: 'sin' };
  const dia = toPlainDate(instante, zona);
  const hoy = toPlainDate(ahora, zona);
  if (dia === hoy) {
    return { tipo: 'hoy', hora: formatDateInTz(instante, zona, { locale, hour: 'numeric', minute: '2-digit', hour12: true }) };
  }
  if (dia === previousPlainDay(hoy)) return { tipo: 'ayer' };
  const mismoAno = dia.slice(0, 4) === hoy.slice(0, 4);
  return {
    tipo: 'fecha',
    texto: formatDateInTz(instante, zona, { locale, day: 'numeric', month: 'short', ...(mismoAno ? {} : { year: 'numeric' }) }),
  };
}
