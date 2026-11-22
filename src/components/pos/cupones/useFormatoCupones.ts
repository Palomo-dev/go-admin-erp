'use client';

import { useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatDateInTz, formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { avisoVigencia, usosRestantes } from './cuponesVista';
import type { Coupon, CuponFila, EstadoCupon } from './types';

/**
 * Textos de un cupón con la moneda, el idioma y la zona horaria de la
 * organización (las vigencias son instantes: se muestran en su día local).
 */
export function useFormatoCupones() {
  const t = useTranslations('posCupones');
  const moneda = useMonedaOrganizacion();
  const locale = useLocaleIntl();
  const { timezone, getToday, toDate } = useFormatDate(null);

  const numero = useCallback((n: number) => new Intl.NumberFormat(locale).format(n), [locale]);
  const fechaCorta = useCallback(
    (v: string | null | undefined) => formatDateInTz(v, timezone, { locale, day: 'numeric', month: 'short', year: 'numeric' }),
    [timezone, locale],
  );
  const fechaHora = useCallback((v: string | null | undefined) => formatDateTimeInTz(v, timezone, { locale }), [timezone, locale]);
  /** Un día calendario 'YYYY-MM-DD' (no es un instante: no se convierte de zona). */
  const diaPlano = useCallback(
    (d: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`)),
    [locale],
  );
  /** Día 'YYYY-MM-DD' de la organización de un instante (para el formulario). */
  const dia = useCallback((v: string | null | undefined) => (v ? toDate(new Date(v)) : null), [toDate]);

  const descuento = useCallback(
    (c: Pick<Coupon, 'discount_type' | 'discount_value'>) =>
      c.discount_type === 'percentage' ? `${numero(Number(c.discount_value))} %` : moneda.formatear(Number(c.discount_value)),
    [numero, moneda],
  );

  const detalleDescuento = useCallback(
    (c: CuponFila) => {
      if (c.lote_total && c.batch_id) return t('lista.lote', { prefijo: c.code.split('-')[0], n: c.lote_total });
      if (c.discount_type === 'fixed_amount') return t('lista.montoFijo');
      return c.max_discount_amount ? t('lista.tope', { monto: moneda.formatear(Number(c.max_discount_amount)) }) : t('lista.sinTope');
    },
    [t, moneda],
  );

  const condiciones = useCallback(
    (c: CuponFila | Coupon): { linea: string; detalle: string | null } => {
      const fila = c as CuponFila;
      const cliente = fila.cliente_nombre ?? c.customer?.full_name ?? null;
      const promocion = fila.promocion_nombre ?? c.promotion?.name ?? null;
      if (promocion && !c.min_purchase_amount) return { linea: t('lista.promocion', { nombre: promocion }), detalle: null };
      const linea = c.min_purchase_amount
        ? t('lista.compraMinima', { monto: moneda.formatear(Number(c.min_purchase_amount)) })
        : c.applies_to_first_purchase
          ? t('lista.primeraCompra')
          : t('lista.sinCondiciones');
      const detalle = cliente
        ? t('lista.cliente', { nombre: cliente })
        : c.applies_to_first_purchase
          ? t('lista.soloNuevos')
          : c.usage_limit_per_customer
            ? t('lista.porCliente', { n: c.usage_limit_per_customer })
            : null;
      return { linea, detalle };
    },
    [t, moneda],
  );

  const usos = useCallback(
    (c: Pick<Coupon, 'usage_limit' | 'usage_count'>, estado: EstadoCupon): { linea: string; detalle: string } => {
      const restantes = usosRestantes(c);
      if (restantes === null) return { linea: t('lista.usosSinLimite', { n: c.usage_count || 0 }), detalle: t('lista.sinLimite') };
      return {
        linea: t('lista.usos', { usados: c.usage_count || 0, limite: c.usage_limit ?? 0 }),
        detalle: estado === 'agotado' ? t('estado.agotado').toLowerCase() : c.usage_limit === 1 ? t('lista.usoUnico') : t('lista.quedan', { n: restantes }),
      };
    },
    [t],
  );

  const vigencia = useCallback(
    (c: Pick<Coupon, 'start_date' | 'end_date'>, estado: EstadoCupon): { linea: string; detalle: string | null } => {
      const linea = c.start_date && c.end_date
        ? `${fechaCorta(c.start_date)} – ${fechaCorta(c.end_date)}`
        : c.start_date
          ? t('lista.desde', { fecha: fechaCorta(c.start_date) })
          : c.end_date
            ? t('lista.hasta', { fecha: fechaCorta(c.end_date) })
            : t('lista.sinVencimiento');
      const aviso = avisoVigencia(estado, getToday(), dia(c.start_date), dia(c.end_date));
      const detalle = aviso ? t(aviso.tipo === 'vence' ? 'lista.venceEn' : 'lista.empiezaEn', { n: aviso.dias }) : null;
      return { linea, detalle };
    },
    [t, fechaCorta, getToday, dia],
  );

  return useMemo(
    () => ({ moneda, numero, fechaCorta, fechaHora, dia, diaPlano, descuento, detalleDescuento, condiciones, usos, vigencia, timezone, getToday }),
    [moneda, numero, fechaCorta, fechaHora, dia, diaPlano, descuento, detalleDescuento, condiciones, usos, vigencia, timezone, getToday],
  );
}

/** Símbolo de la moneda («$», «€») para el prefijo de los campos de monto. */
export function simboloMoneda(code: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? code;
  } catch {
    return code;
  }
}
