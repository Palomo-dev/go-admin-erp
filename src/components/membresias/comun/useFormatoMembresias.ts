'use client';

import { useMemo } from 'react';
import { useFormatoEntero, useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatDateInTz, formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { DEFAULT_TIMEZONE, toPlainDate } from '@/lib/utils/dateCore';
import { formatearDiaPlano } from '../logica';

export interface FormatoMembresias {
  locale: string;
  zona: string;
  /** Instante (timestamptz) → «8 oct 2026» en la zona de la organización. */
  fecha: (iso: string | Date | null | undefined) => string;
  /** Instante → «8 oct». */
  fechaCorta: (iso: string | Date | null | undefined) => string;
  /** Instante → «8 oct 2026, 06:12». */
  fechaHora: (iso: string | Date | null | undefined) => string;
  /** Día calendario (`date` de la base) → «8 oct 2026». Sin conversión de zona. */
  dia: (plain: string | null | undefined) => string;
  diaCorto: (plain: string | null | undefined) => string;
  /** Instante → día calendario de la organización (YYYY-MM-DD). */
  diaDe: (iso: string) => string;
  moneda: (valor: number | null | undefined) => string;
  monedaCompacta: (valor: number | null | undefined) => string;
  entero: (n: number) => string;
}

/**
 * Formatos de las pantallas de Membresías: idioma activo, zona que trae la respuesta del API
 * (la de la organización) y moneda de la organización. Nunca la zona del navegador.
 */
export function useFormatoMembresias(zonaRespuesta: string | null | undefined): FormatoMembresias {
  const locale = useLocaleIntl();
  const entero = useFormatoEntero();
  const { formatear, code } = useMonedaOrganizacion();
  const zona = zonaRespuesta || DEFAULT_TIMEZONE;

  return useMemo(() => {
    let compacto: Intl.NumberFormat | null = null;
    try {
      compacto = new Intl.NumberFormat(locale, { style: 'currency', currency: code, notation: 'compact', maximumFractionDigits: 1 });
    } catch {
      compacto = null;
    }
    return {
      locale,
      zona,
      fecha: (iso) => formatDateInTz(iso, zona, { locale, day: 'numeric', month: 'short', year: 'numeric' }),
      fechaCorta: (iso) => formatDateInTz(iso, zona, { locale, day: 'numeric', month: 'short' }),
      fechaHora: (iso) =>
        formatDateTimeInTz(iso, zona, { locale, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      dia: (plain) => formatearDiaPlano(plain, locale),
      diaCorto: (plain) => formatearDiaPlano(plain, locale, { day: 'numeric', month: 'short' }),
      diaDe: (iso) => toPlainDate(new Date(iso), zona),
      moneda: (valor) => formatear(valor ?? 0),
      monedaCompacta: (valor) => (compacto ? compacto.format(valor ?? 0) : formatear(valor ?? 0)),
      entero,
    };
  }, [locale, zona, formatear, code, entero]);
}
