/**
 * Índice de traducciones - Sistema de internacionalización GoAdminERP
 */

import { es } from './es';
import { en } from './en';
import { pt } from './pt';
import { fr } from './fr';
import type { Locale } from '../locales';

export const translations = {
  es,
  en,
  pt,
  fr
} as const;

export type TranslationKeys = typeof es;
export type DeepKeyOf<T> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? `${K}.${DeepKeyOf<T[K]>}`
          : K
        : never;
    }[keyof T]
  : never;

export type TranslationKey = DeepKeyOf<TranslationKeys>;

/**
 * Obtiene una traducción anidada usando notación de puntos
 */
export const getNestedTranslation = (
  obj: any,
  path: string,
  fallback: string = path
): string => {
  const keys = path.split('.');
  let result = obj;
  
  for (const key of keys) {
    if (result && typeof result === 'object' && key in result) {
      result = result[key];
    } else {
      return fallback;
    }
  }
  
  return typeof result === 'string' ? result : fallback;
};

/**
 * Obtiene las traducciones para un idioma específico
 */
export const getTranslations = (locale: Locale): TranslationKeys => {
  return translations[locale] || translations.es;
};
