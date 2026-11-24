'use client';

/**
 * Textos derivados de la pantalla Referidos: recompensa de un programa
 * («Crédito $ 50.000 · ambos»), dinero en la moneda base de la organización
 * (nunca cableada) y fechas cortas en su zona horaria («27 sep.»).
 */

import { useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { fechaCortaInstante } from '@/components/crm/kit/fechasCrm';
import { localeIntl } from '@/components/kit/idioma';
import type { ReferralProgram } from '@/lib/services/crm/referralsService';

type Programa = Pick<ReferralProgram, 'reward_type' | 'reward_amount' | 'reward_to'>;

const TIPOS = ['credit', 'discount', 'cash', 'gift'] as const;
const PARA = ['referrer', 'referred', 'both'] as const;

export function useReferidosFormato() {
  const t = useTranslations('crm.redReferidos');
  const idioma = useLocale();
  const { timezone, toDate, getToday } = useFormatDate();
  const moneda = useMonedaOrganizacion();

  const dinero = useCallback((n: number | string | null | undefined) => moneda.formatear(n), [moneda]);

  const fecha = useCallback((iso: string | null | undefined) => fechaCortaInstante(iso, timezone, idioma), [timezone, idioma]);

  const porcentaje = useCallback(
    (n: number | string | null | undefined) => `${new Intl.NumberFormat(localeIntl(idioma), { maximumFractionDigits: 2 }).format(Number(n) || 0)} %`,
    [idioma],
  );

  /** «Crédito $ 50.000» / «Descuento 10 %» / «Regalo». */
  const valor = useCallback(
    (p: Programa) => {
      const tipo = (TIPOS as readonly string[]).includes(p.reward_type) ? t(`tipo.${p.reward_type}`) : p.reward_type;
      const n = Number(p.reward_amount) || 0;
      if (p.reward_type === 'discount') return `${tipo} ${porcentaje(n)}`;
      if (p.reward_type === 'gift' && n <= 0) return tipo;
      return `${tipo} ${dinero(n)}`;
    },
    [t, porcentaje, dinero],
  );

  const para = useCallback((p: Programa, largo = false) => ((PARA as readonly string[]).includes(p.reward_to) ? t(`${largo ? 'paraLargo' : 'para'}.${p.reward_to}`) : p.reward_to), [t]);

  /** «Crédito $ 50.000 · ambos» (tabla) o «… · para ambos» (programas). */
  const recompensa = useCallback((p: Programa | null | undefined, largo = false) => (p ? `${valor(p)} · ${para(p, largo)}` : t('programa.sinRecompensa')), [valor, para, t]);

  /** Símbolo de la moneda base («$», «US$») para el prefijo de los campos de valor. */
  let simbolo = moneda.code;
  try {
    simbolo = new Intl.NumberFormat(moneda.locale, { style: 'currency', currency: moneda.code }).formatToParts(0).find((x) => x.type === 'currency')?.value ?? moneda.code;
  } catch {
    /* código no ISO: se muestra tal cual */
  }

  /** Día calendario de un instante en la zona de la organización. */
  const diaDe = useCallback((iso: string) => toDate(new Date(iso)), [toDate]);

  return { t, idioma, simbolo, monedaCodigo: moneda.code, dinero, fecha, porcentaje, valor, recompensa, diaDe, hoy: getToday };
}
