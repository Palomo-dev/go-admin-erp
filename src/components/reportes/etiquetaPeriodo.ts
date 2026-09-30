/**
 * Rótulo del periodo en el idioma de la persona (la `etiqueta` del periodo es
 * la española que se congela en el cierre). Puro: fechas planas con
 * `timeZone: 'UTC'`, así que el día nunca se corre.
 *
 * `t` resuelve las plantillas del namespace `reportes.periodo`
 * (`trimestre`, `semestre`) que cambian por idioma («T3 2026», «Q3 2026»).
 */
import { etiquetaRango } from '@/components/kit/rangoFechas';
import type { PeriodoCierre } from '@/lib/services/reportes/types';

type Plantilla = (clave: 'trimestre' | 'semestre', valores: { n: number; anio: number }) => string;

function fechaUtc(plana: string): Date {
  const [a, m, d] = plana.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function capitalizar(texto: string, locale: string): string {
  return texto.charAt(0).toLocaleUpperCase(locale) + texto.slice(1);
}

export function etiquetaDePeriodo(p: Pick<PeriodoCierre, 'tipo' | 'fechaInicio' | 'fechaFin'>, locale: string, t: Plantilla): string {
  const [anio, mes] = p.fechaInicio.split('-').map(Number);
  switch (p.tipo) {
    case 'diario':
      return etiquetaRango({ desde: p.fechaInicio, hasta: p.fechaInicio }, locale);
    case 'mensual':
      return capitalizar(new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(fechaUtc(p.fechaInicio)), locale);
    case 'trimestral':
      return t('trimestre', { n: Math.ceil(mes / 3), anio });
    case 'semestral':
      return t('semestre', { n: mes <= 6 ? 1 : 2, anio });
    case 'anual':
      return String(anio);
    default:
      return etiquetaRango({ desde: p.fechaInicio, hasta: p.fechaFin }, locale);
  }
}

/** «4:00 p. m.» de una hora `HH:mm` en el idioma de la persona. */
export function etiquetaHora(hhmm: string, locale: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, h, m)));
}

/** «4:00 p. m. – 2:00 a. m.», o `null` si el periodo es de día completo. */
export function etiquetaFranja(p: Pick<PeriodoCierre, 'horaInicio' | 'horaFin'>, locale: string): string | null {
  if (!p.horaInicio || !p.horaFin) return null;
  return `${etiquetaHora(p.horaInicio, locale)} – ${etiquetaHora(p.horaFin, locale)}`;
}
