'use client';

import { NextIntlClientProvider } from 'next-intl';
import { useEffect, useState, useCallback } from 'react';
import { defaultLocale, Locale, isValidLocale, detectBrowserLocale } from './config';

interface I18nProviderProps {
  children: React.ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [messages, setMessages] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  // Cargar mensajes según el locale
  const loadMessages = useCallback(async (loc: Locale) => {
    try {
      const mod = await import(`../../messages/${loc}.json`);
      setMessages(mod.default);
    } catch {
      // Fallback a español si no encuentra el archivo
      const fallback = await import('../../messages/es.json');
      setMessages(fallback.default);
    }
  }, []);

  useEffect(() => {
    // 1. Leer de localStorage (cache rápido para evitar flash)
    // 2. Si no hay cache, detectar idioma del navegador (mejora UX en primera visita / páginas de auth)
    const cached = localStorage.getItem('preferredLanguage');
    const initialLocale = cached && isValidLocale(cached) ? cached : detectBrowserLocale();
    setLocale(initialLocale);
    loadMessages(initialLocale).then(() => setLoading(false));
  }, [loadMessages]);

  // Escuchar cambios de idioma desde otros componentes
  useEffect(() => {
    const handleLanguageChange = (event: CustomEvent<{ locale: Locale }>) => {
      const newLocale = event.detail.locale;
      if (isValidLocale(newLocale) && newLocale !== locale) {
        setLocale(newLocale);
        localStorage.setItem('preferredLanguage', newLocale);
        loadMessages(newLocale);
      }
    };

    window.addEventListener('languageChange', handleLanguageChange as EventListener);
    return () => {
      window.removeEventListener('languageChange', handleLanguageChange as EventListener);
    };
  }, [locale, loadMessages]);

  if (loading || !messages) return null;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

/**
 * Dispara un cambio de idioma global.
 * Usar desde cualquier componente para cambiar el idioma en runtime.
 *
 * Ejemplo:
 *   import { changeLanguage } from '@/i18n/provider';
 *   changeLanguage('en');
 */
export function changeLanguage(locale: Locale) {
  localStorage.setItem('preferredLanguage', locale);
  window.dispatchEvent(
    new CustomEvent('languageChange', { detail: { locale } })
  );
}
