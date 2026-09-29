'use client';

import { useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/kit';
import { formatearCantidad } from '@/components/kit/inventario/SaldoCorridoCell';
import { localeIntl } from '@/components/kit/idioma';
import { claveErrorInventario } from '@/lib/inventario/nucleo/errores';
import { ErrorProduccion, type ProductionOrderStatus } from '@/lib/services/productionOrderService';

/** Estado de la orden → clave de la tabla única de tonos (docs/design/SISTEMA-BADGES.md). */
const ESTADO_TONO: Record<ProductionOrderStatus, string> = {
  draft: 'draft',
  confirmed: 'confirmed',
  in_progress: 'in progress',
  completed: 'completed',
  cancelled: 'cancelled',
};

export function BadgeEstadoProduccion({ estado, className }: { estado: ProductionOrderStatus; className?: string }) {
  const t = useTranslations('inventarioProduccion.estados');
  return <StatusBadge estado={ESTADO_TONO[estado]} etiqueta={t(estado)} className={className} />;
}

/** Cantidades con hasta 3 decimales en el idioma de la interfaz (productos por peso incluidos). */
export function useFormatoCantidad() {
  const locale = useLocale();
  return useCallback(
    (n: number | null | undefined, unidad?: string | null) => {
      if (n === null || n === undefined || !Number.isFinite(n)) return '—';
      const cuerpo = formatearCantidad(n, locale);
      return unidad ? `${cuerpo} ${unidad.trim().toUpperCase()}` : cuerpo;
    },
    [locale],
  );
}

/** Porcentaje con un decimal («52,8 %»). */
export function useFormatoPorcentaje() {
  const locale = useLocale();
  return useCallback(
    (n: number | null | undefined) =>
      n === null || n === undefined || !Number.isFinite(n)
        ? '—'
        : new Intl.NumberFormat(localeIntl(locale), { style: 'percent', maximumFractionDigits: 1 }).format(n),
    [locale],
  );
}

/** Mensaje de un error de las RPC de producción (o del núcleo) en el idioma de la interfaz. */
export function useMensajeErrorProduccion() {
  const t = useTranslations('inventarioProduccion.errores');
  const tn = useTranslations('inventario.errores');
  return useCallback(
    (e: unknown): string => {
      if (e instanceof ErrorProduccion) {
        const clave = e.clave;
        if (clave !== 'desconocido' && clave !== 'sin_permiso') return t(clave);
        if (clave === 'sin_permiso') return t('sin_permiso');
      }
      const nucleo = claveErrorInventario(e as { message?: string; code?: string });
      return nucleo === 'desconocido' ? t('desconocido') : tn(nucleo);
    },
    [t, tn],
  );
}
