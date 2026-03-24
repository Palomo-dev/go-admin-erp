export const locales = ['es', 'en', 'pt', 'fr'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'es';

export const localeNames: Record<Locale, string> = {
  es: 'Español',
  en: 'English',
  pt: 'Português',
  fr: 'Français',
};

export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}

/**
 * Detecta el idioma preferido del navegador y lo mapea a un locale soportado.
 * Ej: "en-US" → "en", "pt-BR" → "pt", "fr-CA" → "fr"
 * Si no coincide con ninguno soportado, retorna defaultLocale.
 */
export function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return defaultLocale;

  const browserLangs = navigator.languages ?? [navigator.language];

  for (const lang of browserLangs) {
    const code = lang.split('-')[0].toLowerCase();
    if (isValidLocale(code)) return code;
  }

  return defaultLocale;
}
