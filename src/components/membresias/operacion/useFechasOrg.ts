'use client';

/**
 * Fechas de la operación del módulo en la zona de la organización y el idioma
 * activo. Nunca la zona del navegador: una clase a las 07:00 en Bogotá se ve a
 * las 07:00 aunque quien la mire esté en Madrid.
 */
import { useCallback, useMemo } from 'react';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz, todayInTz, toPlainDate } from '@/lib/utils/dateDisplay';
import { horaEnZona } from './logica';

export interface FechasOrg {
  zona: string;
  locale: string;
  /** Hoy (`YYYY-MM-DD`) en la zona. */
  hoy: string;
  /** «28 sep 2026». */
  fecha: (valor: string | Date | null | undefined) => string;
  /** «lun, 28 sep». */
  fechaCorta: (valor: string | Date | null | undefined) => string;
  /** «07:30». */
  hora: (valor: string | Date | null | undefined) => string;
  /** «28 sep 2026 07:30». */
  fechaHora: (valor: string | Date | null | undefined) => string;
  /** Día calendario `YYYY-MM-DD` de un instante en la zona. */
  dia: (valor: string | Date) => string;
  /** Día plano `YYYY-MM-DD` con formato del idioma (no convierte de zona). */
  diaPlano: (dia: string, opciones?: Intl.DateTimeFormatOptions) => string;
}

/** `zonaForzada`: la del dato cuando no hay proveedor de zona (kiosco). */
export function useFechasOrg(zonaForzada?: string | null): FechasOrg {
  const { timezone } = useOrgTimezone();
  const zona = zonaForzada || timezone;
  const locale = useLocaleIntl();

  const fecha = useCallback(
    (v: string | Date | null | undefined) => formatDateInTz(v, zona, { locale, day: 'numeric', month: 'short', year: 'numeric' }),
    [zona, locale],
  );
  const fechaCorta = useCallback(
    (v: string | Date | null | undefined) => formatDateInTz(v, zona, { locale, weekday: 'short', day: 'numeric', month: 'short' }),
    [zona, locale],
  );
  const hora = useCallback((v: string | Date | null | undefined) => (v ? horaEnZona(v, zona) : ''), [zona]);
  const fechaHora = useCallback((v: string | Date | null | undefined) => (v ? `${fecha(v)} ${horaEnZona(v, zona)}` : ''), [fecha, zona]);
  const dia = useCallback((v: string | Date) => toPlainDate(typeof v === 'string' ? new Date(v) : v, zona), [zona]);
  const diaPlano = useCallback(
    (d: string, opciones?: Intl.DateTimeFormatOptions) => {
      const [a, m, dd] = d.split('-').map(Number);
      return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...(opciones ?? { weekday: 'short', day: 'numeric', month: 'short' }) }).format(
        new Date(Date.UTC(a, m - 1, dd, 12)),
      );
    },
    [locale],
  );
  const hoy = todayInTz(zona);

  return useMemo(
    () => ({ zona, locale, hoy, fecha, fechaCorta, hora, fechaHora, dia, diaPlano }),
    [zona, locale, hoy, fecha, fechaCorta, hora, fechaHora, dia, diaPlano],
  );
}
