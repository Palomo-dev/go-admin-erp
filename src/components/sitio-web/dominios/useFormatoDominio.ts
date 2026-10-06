'use client';

/**
 * Formateadores de Dominios ya atados a la zona horaria de la organización y
 * al idioma activo: «14 mar 2027», «hace 4 min», «$ 89.900». Un solo lugar
 * para la lista, el detalle y los diálogos.
 */
import { useCallback, useMemo } from 'react';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatearPrecio } from '../ui/PriceTag';
import { fechaCorta, fechaHora, haceCuanto } from './formatoDominio';
import { useTextosDominios } from './textos';

export function useFormatoDominio() {
  const locale = useLocaleIntl();
  const { timezone } = useFormatDate(null);
  const t = useTextosDominios();

  const fecha = useCallback((v: string | null | undefined) => fechaCorta(v, timezone, locale), [timezone, locale]);
  const fechaYHora = useCallback((v: string | Date | null | undefined) => fechaHora(v, timezone, locale), [timezone, locale]);
  const hace = useCallback(
    (v: string | null | undefined, ahora?: Date) => {
      const h = haceCuanto(v, ahora);
      if (!h) return '';
      return 'n' in h ? t(`hace.${h.clave}`, { n: h.n }) : t(`hace.${h.clave}`);
    },
    [t],
  );
  const precio = useCallback((valor: number, moneda: string) => formatearPrecio(valor, moneda), []);

  return useMemo(() => ({ fecha, fechaYHora, hace, precio, timezone, locale }), [fecha, fechaYHora, hace, precio, timezone, locale]);
}
