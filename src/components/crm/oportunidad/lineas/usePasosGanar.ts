'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateTimeInTz, formatPlainDate } from '@/lib/utils/dateDisplay';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { leerOportunidad } from '../apiOportunidades';
import { cantidadLineas, lineasDesdeApi, totalesLineas, type Lineas } from '../lineasLogica';
import { pasosDeLineas, rangoCorto } from './ganarDeLineas';

const FECHA: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

/**
 * Lee las líneas de la oportunidad al abrir «Ganar» y arma sus pasos y el
 * resumen «6 líneas · $ 6.197.520». Sin líneas (o si la lectura falla), el
 * diálogo usa su lista por defecto.
 */
export function usePasosGanar(oportunidadId: string | null, moneda: ContextoMoneda, cliente: string | null): { pasos: ReturnType<typeof pasosDeLineas> | null; resumen: string | null } {
  const t = useTranslations('crm.kit.ganar.derivados');
  const { timezone } = useFormatDate();
  const [lineas, setLineas] = useState<Lineas | null>(null);
  useEffect(() => {
    setLineas(null);
    if (!oportunidadId) return;
    const c = new AbortController();
    leerOportunidad(oportunidadId, c.signal).then((op) => setLineas(lineasDesdeApi(op)), () => undefined);
    return () => c.abort();
  }, [oportunidadId]);
  return useMemo(() => {
    if (!lineas || cantidadLineas(lineas) === 0) return { pasos: null, resumen: null };
    const pasos = pasosDeLineas(lineas, (k, v) => t(k, v), { fecha: (d) => formatPlainDate(d, FECHA), instante: (d) => formatDateTimeInTz(d, timezone), rango: rangoCorto }, cliente);
    return { pasos, resumen: t('resumen', { n: cantidadLineas(lineas), total: formatMoneda(totalesLineas(lineas).total, moneda) }) };
  }, [lineas, t, timezone, moneda, cliente]);
}
