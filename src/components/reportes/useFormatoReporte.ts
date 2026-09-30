'use client';

/**
 * Formato de las cifras de un reporte en pantalla: moneda base de la
 * organización, números y porcentajes con los separadores del idioma, y
 * fechas con la zona de la organización (instantes) o sin convertir (días
 * planos). Los textos ya formateados por el reporte pasan tal cual.
 */
import { useCallback } from 'react';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import type { ReporteKPI, TipoColumna } from '@/lib/services/reportes/types';

const FECHA_PLANA = /^\d{4}-\d{2}-\d{2}$/;
const INSTANTE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

export function useFormatoReporte() {
  const locale = useLocaleIntl();
  const { formatear } = useMonedaOrganizacion();
  const { formatDateTime, formatPlain } = useFormatDate();

  const numero = useCallback((n: number, decimales = 0) => new Intl.NumberFormat(locale, { maximumFractionDigits: decimales }).format(n), [locale]);
  const porcentaje = useCallback((n: number) => `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)} %`, [locale]);

  const valor = useCallback(
    (v: unknown, tipo: TipoColumna | ReporteKPI['formato'] | undefined): string => {
      if (v === null || v === undefined || v === '') return '—';
      if (typeof v === 'boolean') return v ? '✓' : '—';
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
      switch (tipo) {
        case 'moneda':
          return n === null ? String(v) : formatear(n);
        case 'numero':
          return n === null ? String(v) : numero(n, 2);
        case 'porcentaje':
          return n === null ? String(v) : porcentaje(n);
        case 'fecha':
          if (typeof v === 'string' && FECHA_PLANA.test(v)) return formatPlain(v);
          if (typeof v === 'string' && INSTANTE.test(v)) return formatDateTime(v);
          return String(v);
        default:
          return String(v);
      }
    },
    [formatear, numero, porcentaje, formatPlain, formatDateTime],
  );

  return { valor, numero, porcentaje, locale };
}
