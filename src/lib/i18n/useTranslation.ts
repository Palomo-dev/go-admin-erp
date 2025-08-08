/**
 * Hook de internacionalización personalizado para GoAdminERP
 * Proporciona traducciones, formateo de fechas y números
 */

import { useState, useEffect } from 'react';
import { getCurrentLocale, setCurrentLocale, LOCALES, type Locale } from './locales';
import { getTranslations, getNestedTranslation, type TranslationKeys } from './translations';

export const useTranslation = () => {
  const [locale, setLocale] = useState<Locale>(getCurrentLocale());
  const [translations, setTranslations] = useState<TranslationKeys>(getTranslations(locale));

  useEffect(() => {
    setTranslations(getTranslations(locale));
  }, [locale]);

  /**
   * Función principal de traducción
   */
  const t = (key: string, fallback?: string): string => {
    return getNestedTranslation(translations, key, fallback || key);
  };

  /**
   * Cambia el idioma actual
   */
  const changeLocale = (newLocale: Locale) => {
    setCurrentLocale(newLocale);
    setLocale(newLocale);
  };

  /**
   * Formatea una fecha según la configuración regional
   */
  const formatDate = (date: string | Date | null): string => {
    if (!date) return '-';
    
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      const config = LOCALES[locale];
      
      return new Intl.DateTimeFormat(locale, config.dateFormat).format(dateObj);
    } catch (error) {
      console.warn('Error formatting date:', error);
      return '-';
    }
  };

  /**
   * Formatea un número según la configuración regional
   */
  const formatNumber = (number: number | null | undefined): string => {
    if (number === null || number === undefined) return '0';
    
    try {
      const config = LOCALES[locale];
      return new Intl.NumberFormat(locale, config.numberFormat).format(number);
    } catch (error) {
      console.warn('Error formatting number:', error);
      return String(number);
    }
  };

  /**
   * Formatea un porcentaje
   */
  const formatPercentage = (value: number | null | undefined, decimals: number = 2): string => {
    if (value === null || value === undefined) return '0%';
    
    try {
      return new Intl.NumberFormat(locale, {
        style: 'percent',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(value / 100);
    } catch (error) {
      console.warn('Error formatting percentage:', error);
      return `${value}%`;
    }
  };

  /**
   * Formatea una moneda
   */
  const formatCurrency = (
    amount: number | null | undefined, 
    currency: string = 'EUR'
  ): string => {
    if (amount === null || amount === undefined) return '-';
    
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    } catch (error) {
      console.warn('Error formatting currency:', error);
      return `${currency} ${amount}`;
    }
  };

  /**
   * Formatea un número con separadores de miles
   */
  const formatLargeNumber = (number: number | null | undefined): string => {
    if (number === null || number === undefined) return '0';
    
    try {
      return new Intl.NumberFormat(locale).format(number);
    } catch (error) {
      console.warn('Error formatting large number:', error);
      return String(number);
    }
  };

  /**
   * Obtiene una fecha relativa (hace X tiempo)
   */
  const formatRelativeTime = (date: string | Date | null): string => {
    if (!date) return '-';
    
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);
      
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      
      if (diffInSeconds < 60) {
        return rtf.format(-diffInSeconds, 'second');
      } else if (diffInSeconds < 3600) {
        return rtf.format(-Math.floor(diffInSeconds / 60), 'minute');
      } else if (diffInSeconds < 86400) {
        return rtf.format(-Math.floor(diffInSeconds / 3600), 'hour');
      } else if (diffInSeconds < 2592000) {
        return rtf.format(-Math.floor(diffInSeconds / 86400), 'day');
      } else if (diffInSeconds < 31536000) {
        return rtf.format(-Math.floor(diffInSeconds / 2592000), 'month');
      } else {
        return rtf.format(-Math.floor(diffInSeconds / 31536000), 'year');
      }
    } catch (error) {
      console.warn('Error formatting relative time:', error);
      return formatDate(date);
    }
  };

  return {
    t,
    locale,
    changeLocale,
    formatDate,
    formatNumber,
    formatPercentage,
    formatCurrency,
    formatLargeNumber,
    formatRelativeTime,
    availableLocales: Object.values(LOCALES),
    translations
  };
};
