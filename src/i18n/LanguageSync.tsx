'use client';

import { useEffect, useRef } from 'react';
import { useSession } from '@/lib/context/SessionContext';
import { supabase } from '@/lib/supabase/config';
import { isValidLocale, defaultLocale, Locale } from './config';
import { changeLanguage } from './provider';

/**
 * Componente que sincroniza el idioma preferido del usuario
 * desde profiles.preferred_language hacia el I18nProvider.
 *
 * Debe montarse DENTRO del SessionProvider.
 */
export function LanguageSync() {
  const { session } = useSession();
  const hasSynced = useRef(false);

  useEffect(() => {
    if (!session?.user?.id || hasSynced.current) return;

    const syncLanguage = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('preferred_language')
          .eq('id', session.user.id)
          .single();

        if (error || !data) return;

        const dbLang = data.preferred_language as string;
        const locale: Locale = isValidLocale(dbLang) ? dbLang : defaultLocale;
        const cached = localStorage.getItem('preferredLanguage');

        // Solo actualizar si difiere del cache actual
        if (cached !== locale) {
          changeLanguage(locale);
        }

        hasSynced.current = true;
      } catch {
        // Silenciar error - el idioma por defecto funciona bien
      }
    };

    syncLanguage();
  }, [session?.user?.id]);

  return null;
}
