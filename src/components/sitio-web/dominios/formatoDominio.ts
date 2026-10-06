/**
 * Formatos de Dominios (puro): «14 mar 2027», «hace 4 min» y el precio. La
 * zona horaria y el idioma llegan como argumentos (zona de la organización vía
 * `useFormatDate`); nada se cablea. Los valores son `timestamptz`, así que se
 * convierten con `formatDateInTz`.
 */
import { formatDateInTz } from '@/lib/utils/dateDisplay';

/** «14 mar 2027» (sin punto ni «de»; Figma B/07-01). */
export function fechaCorta(valor: string | null | undefined, zona: string, locale: string): string {
  if (!valor) return '';
  const texto = formatDateInTz(valor, zona, { locale, day: 'numeric', month: 'short', year: 'numeric' });
  return texto.replace(/\./g, '').replace(/\sde\s/g, ' ');
}

/** «5 oct 2026 10:42 a. m.» (B/07-20). */
export function fechaHora(valor: string | Date | null | undefined, zona: string, locale: string): string {
  if (!valor) return '';
  const fecha = fechaCorta(typeof valor === 'string' ? valor : valor.toISOString(), zona, locale);
  const hora = formatDateInTz(valor, zona, { locale, hour: 'numeric', minute: '2-digit', hour12: true });
  return `${fecha} ${hora}`;
}

export type Hace = { clave: 'ahora' } | { clave: 'minutos' | 'horas' | 'dias'; n: number } | { clave: 'unDia' };

/** Tiempo transcurrido para «Revisado hace 4 min». Puro. */
export function haceCuanto(valor: string | null | undefined, ahora: Date = new Date()): Hace | null {
  if (!valor) return null;
  const t = Date.parse(valor);
  if (!Number.isFinite(t)) return null;
  const min = Math.max(0, Math.floor((ahora.getTime() - t) / 60_000));
  if (min < 1) return { clave: 'ahora' };
  if (min < 60) return { clave: 'minutos', n: min };
  const h = Math.floor(min / 60);
  if (h < 24) return { clave: 'horas', n: h };
  const d = Math.floor(h / 24);
  return d === 1 ? { clave: 'unDia' } : { clave: 'dias', n: d };
}
