/**
 * Idioma del kit, sin React (lo usan los hooks de `useIdiomaKit` y los tests).
 *
 * next-intl entrega el idioma corto (`es`, `en`, `fr`, `pt`); `Intl` necesita
 * una región para agrupar miles como se espera: `Intl.NumberFormat('es')` deja
 * «1000» sin punto, `es-CO` da «1.000». El español de la app es el de
 * Colombia; el portugués, el de Brasil.
 */

export const LOCALE_INTL: Readonly<Record<string, string>> = {
  es: 'es-CO',
  en: 'en-US',
  fr: 'fr-FR',
  pt: 'pt-BR',
};

/** Locale de `Intl` para el idioma activo; uno desconocido pasa tal cual. */
export function localeIntl(locale: string | null | undefined): string {
  const corto = (locale ?? '').trim();
  if (!corto) return LOCALE_INTL.es;
  return LOCALE_INTL[corto] ?? LOCALE_INTL[corto.split('-')[0].toLowerCase()] ?? corto;
}

/** Entero con los separadores del idioma («1.000», «1,000», «1 000»). */
export function formatearEnteroEn(n: number, locale: string | null | undefined): string {
  try {
    return new Intl.NumberFormat(localeIntl(locale), { maximumFractionDigits: 0 }).format(n);
  } catch {
    return String(Math.round(n));
  }
}
