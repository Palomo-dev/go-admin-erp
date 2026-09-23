'use client';

/**
 * Fechas de la ficha del cliente en el idioma activo y en la zona horaria de
 * la organización (CLAUDE.md, reglas de fechas):
 *
 * - `instante` → columnas timestamptz (convierte a la zona de la organización).
 * - `plana` → columnas date (día calendario puro: no convierte zona).
 * - `relativa` → «hace 3 días» / «in 2 days» con date-fns en el idioma activo.
 */
import { useCallback } from 'react';
import { useLocale } from 'next-intl';
import { formatDistanceToNow, type Locale } from 'date-fns';
import { enUS, es, fr, ptBR } from 'date-fns/locale';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';

const LOCALES_DATE_FNS: Readonly<Record<string, Locale>> = { es, en: enUS, fr, pt: ptBR };

const DIA_PLANO = /^(\d{4})-(\d{2})-(\d{2})/;

export function useFechasFicha() {
  const locale = useLocaleIntl();
  const idioma = useLocale();
  const { timezone } = useFormatDate();

  const instante = useCallback(
    (valor: string | Date | null | undefined, opciones?: Intl.DateTimeFormatOptions) =>
      formatDateInTz(valor, timezone, { locale, ...(opciones ?? {}) }),
    [timezone, locale],
  );

  const plana = useCallback(
    (valor: string | null | undefined, opciones?: Intl.DateTimeFormatOptions) => {
      const partes = DIA_PLANO.exec(valor ?? '');
      if (!partes) return '';
      // Mediodía UTC formateado en UTC: el día calendario no se corre.
      const dia = new Date(Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]), 12));
      return new Intl.DateTimeFormat(locale, {
        ...(opciones ?? { day: '2-digit', month: '2-digit', year: 'numeric' }),
        timeZone: 'UTC',
      }).format(dia);
    },
    [locale],
  );

  const relativa = useCallback(
    (valor: string) =>
      formatDistanceToNow(new Date(valor), {
        addSuffix: true,
        locale: LOCALES_DATE_FNS[idioma.split('-')[0]] ?? es,
      }),
    [idioma],
  );

  return { instante, plana, relativa, locale };
}

/** Mensaje de un error de Supabase o de JS; `null` si no trae uno. */
export function mensajeError(err: unknown): string | null {
  if (err && typeof err === 'object' && 'message' in err) {
    const { message } = err as { message: unknown };
    if (typeof message === 'string' && message.trim()) return message;
  }
  return null;
}
