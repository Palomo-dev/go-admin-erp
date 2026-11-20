'use client';

/**
 * Formatos de Propinas: dinero en la moneda de la organización y fechas en su
 * zona horaria (nunca la del navegador). Un solo lugar para toda la página.
 */
import { useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFormatoEntero, useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { etiquetaRango } from '@/components/kit';
import type { MedioLiquidacion, RepartoLiquidacion, TipoPropina } from '@/lib/pos/propinas/tiposPropinas';

export function useFormatoPropinas() {
  const moneda = useMonedaOrganizacion();
  const entero = useFormatoEntero();
  const locale = useLocaleIntl();
  const { timezone, getToday } = useFormatDate();

  const formatos = useMemo(
    () => ({
      dia: new Intl.DateTimeFormat(locale, { timeZone: timezone, day: 'numeric', month: 'short' }),
      hora: new Intl.DateTimeFormat(locale, { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }),
      completo: new Intl.DateTimeFormat(locale, {
        timeZone: timezone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
      mes: new Intl.DateTimeFormat(locale, { timeZone: timezone, month: 'long' }),
    }),
    [locale, timezone],
  );

  const seguro = (f: Intl.DateTimeFormat, v: string | null | undefined) => {
    if (!v) return '';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '' : f.format(d).replace(',', '');
  };

  return {
    formatear: useCallback((v: number | null | undefined) => moneda.formatear(v ?? 0), [moneda]),
    entero,
    locale,
    hoy: getToday(),
    dia: (v: string | null | undefined) => seguro(formatos.dia, v),
    hora: (v: string | null | undefined) => seguro(formatos.hora, v),
    fechaHora: (v: string | null | undefined) => seguro(formatos.completo, v),
    mes: (v: string | Date) => formatos.mes.format(typeof v === 'string' ? new Date(v) : v),
    periodo: (desde: string | null | undefined, hasta: string | null | undefined) =>
      desde || hasta ? etiquetaRango({ desde: (desde ?? hasta)!, hasta: (hasta ?? desde)! }, locale) : '',
  };
}

/** Etiquetas traducidas de tipos, repartos y medios. */
export function useEtiquetasPropinas() {
  const t = useTranslations('posPropinas');
  return {
    tipo: (v: TipoPropina) => t(`tipos.${v}`),
    reparto: (v: RepartoLiquidacion) => t(`repartos.${v}`),
    medio: (v: MedioLiquidacion) => t(`medios.${v}`),
  };
}
