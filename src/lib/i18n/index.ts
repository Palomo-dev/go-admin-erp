/**
 * Exportaciones principales del sistema de internacionalización
 */

export { useTranslation } from './useTranslation';
export { getCurrentLocale, setCurrentLocale, LOCALES, DEFAULT_LOCALE } from './locales';
export { translations, getTranslations, getNestedTranslation } from './translations';
export type { Locale, LocaleConfig } from './locales';
export type { TranslationKeys, TranslationKey } from './translations';
