/**
 * Sistema de internacionalización para GoAdminERP
 * Soporte para múltiples idiomas y formatos regionales
 */

export type Locale = 'es' | 'en' | 'pt' | 'fr';

export interface LocaleConfig {
  code: Locale;
  name: string;
  flag: string;
  dateFormat: Intl.DateTimeFormatOptions;
  numberFormat: Intl.NumberFormatOptions;
  currencyFormat: Intl.NumberFormatOptions;
}

export const LOCALES: Record<Locale, LocaleConfig> = {
  es: {
    code: 'es',
    name: 'Español',
    flag: '🇪🇸',
    dateFormat: {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    },
    numberFormat: {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    },
    currencyFormat: {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2
    }
  },
  en: {
    code: 'en',
    name: 'English',
    flag: '🇺🇸',
    dateFormat: {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    },
    numberFormat: {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    },
    currencyFormat: {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }
  },
  pt: {
    code: 'pt',
    name: 'Português',
    flag: '🇧🇷',
    dateFormat: {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    },
    numberFormat: {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    },
    currencyFormat: {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2
    }
  },
  fr: {
    code: 'fr',
    name: 'Français',
    flag: '🇫🇷',
    dateFormat: {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    },
    numberFormat: {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    },
    currencyFormat: {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2
    }
  }
};

export const DEFAULT_LOCALE: Locale = 'es';

/**
 * Obtiene la configuración de idioma desde localStorage o usa el predeterminado
 */
export const getCurrentLocale = (): Locale => {
  if (typeof window === 'undefined') {
    return DEFAULT_LOCALE;
  }
  
  try {
    const stored = localStorage.getItem('app_locale');
    if (stored && stored in LOCALES) {
      return stored as Locale;
    }
  } catch (error) {
    console.warn('Error obteniendo idioma del localStorage:', error);
  }
  
  return DEFAULT_LOCALE;
};

/**
 * Guarda la configuración de idioma en localStorage
 */
export const setCurrentLocale = (locale: Locale): void => {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem('app_locale', locale);
  } catch (error) {
    console.warn('Error guardando idioma en localStorage:', error);
  }
};
