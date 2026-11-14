'use client';

import { useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { momentoCorto } from './comunLogica';

/**
 * «hoy 10:41», «ayer 9:05» o «28 oct», en la zona de la organización, más la
 * fecha y hora completas para el `title`/`dateTime` del elemento.
 */
export function useMomentoCorto() {
  const t = useTranslations('chatHilo.comun');
  const locale = useLocale();
  const { timezone, formatTime, formatDateTime, getToday } = useFormatDate();
  const hoy = getToday();

  return useCallback(
    (instante: string | null | undefined): { corto: string; largo: string } => {
      const m = momentoCorto(instante, timezone, hoy);
      if (!m) return { corto: '', largo: '' };
      const largo = formatDateTime(m.instante);
      if (m.tipo === 'hoy') return { corto: t('hoy', { hora: formatTime(m.instante) }), largo };
      if (m.tipo === 'ayer') return { corto: t('ayer', { hora: formatTime(m.instante) }), largo };
      const corto = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: timezone }).format(new Date(m.instante));
      return { corto, largo };
    },
    [t, locale, timezone, hoy, formatTime, formatDateTime],
  );
}
