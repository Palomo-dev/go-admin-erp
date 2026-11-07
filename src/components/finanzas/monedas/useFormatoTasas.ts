'use client';

import { useMemo } from 'react';
import { etiquetaDiaTrigger } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { contextoMoneda, crearFormateadorMoneda } from '@/lib/utils/moneda';
import { decimalesTasa } from '@/lib/finanzas/monedas/tasasLogica';

export interface FormatoTasas {
  /** Una tasa expresada en la moneda base («$ 3.905,00»). */
  tasa: (valor: number) => string;
  /** Valor absoluto con un decimal y «%» («0,4 %»); el signo lo pone la flecha. */
  porcentaje: (valor: number) => string;
  /** Día `YYYY-MM-DD` de la organización («7 nov 2026»). */
  dia: (dia: string) => string;
  /** Día corto sin año para ejes («7 nov», «Nov 7»). */
  diaCorto: (dia: string) => string;
  /** Hora de un instante en la zona de la organización («9:00 p. m.»). */
  hora: (instante: string | null | undefined) => string;
}

/**
 * Formatos de Monedas y tasas. Dinero con el locale de la organización y la
 * moneda base que llega (no la del caché: puede acabar de cambiar); fechas y
 * porcentajes en el idioma de la interfaz y la zona de la organización.
 */
export function useFormatoTasas(base: string | null): FormatoTasas {
  const { locale: localeMoneda } = useMonedaOrganizacion();
  const localeUi = useLocaleIntl();
  const { timezone } = useFormatDate();

  return useMemo(() => {
    const formateadores = new Map<number, (v: number) => string>();
    const ctx = contextoMoneda(base ?? 'USD', { locale: localeMoneda });
    const pct = new Intl.NumberFormat(localeUi, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    // Día plano a mediodía UTC con `timeZone: 'UTC'`: no se corre de día en ninguna zona.
    const corto = new Intl.DateTimeFormat(localeUi, { day: 'numeric', month: 'short', timeZone: 'UTC' });
    return {
      tasa: (valor: number) => {
        const d = decimalesTasa(valor);
        let f = formateadores.get(d);
        if (!f) {
          f = crearFormateadorMoneda(ctx, { decimals: d });
          formateadores.set(d, f);
        }
        return f(valor);
      },
      porcentaje: (valor: number) => `${pct.format(Math.abs(valor))} %`,
      dia: (dia: string) => etiquetaDiaTrigger(dia, localeUi),
      diaCorto: (dia: string) => {
        const [a, m, d] = dia.split('-').map(Number);
        return a && m && d ? corto.format(new Date(Date.UTC(a, m - 1, d, 12))) : dia;
      },
      hora: (instante) => formatDateInTz(instante, timezone, { locale: localeUi, hour: 'numeric', minute: '2-digit' }),
    };
  }, [base, localeMoneda, localeUi, timezone]);
}
