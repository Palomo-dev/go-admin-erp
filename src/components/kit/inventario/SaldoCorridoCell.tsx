'use client';

import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { localeIntl } from '@/components/kit/idioma';

/**
 * Celda de kardex: cantidad con signo (entrada verde «+5», salida roja «−3») y,
 * debajo, el saldo tras el movimiento; en rojo si queda negativo. Opcionalmente
 * el costo promedio tras el movimiento (`stock_movements.avg_cost_after`), ya
 * formateado por la pantalla con `useMonedaOrganizacion().formatear`.
 *
 * Las cantidades son decimales de hasta 3 cifras (numeric(12,3)).
 *
 * ```tsx
 * <SaldoCorridoCell direccion={m.direction} cantidad={m.qty} saldo={m.saldo} unidad="UN"
 *                   costoPromedio={permisos.costos ? formatear(m.avg_cost_after) : undefined} />
 * ```
 */
export interface SaldoCorridoCellProps {
  direccion: 'in' | 'out';
  cantidad: number;
  /** Saldo del producto (sucursal, y lote si aplica) justo después del movimiento. */
  saldo: number | null | undefined;
  unidad?: string | null;
  /** Texto ya formateado; se omite si el usuario no puede ver costos. */
  costoPromedio?: string | null;
  alineacion?: 'izquierda' | 'derecha';
  className?: string;
}

export function formatearCantidad(n: number, locale: string): string {
  try {
    return new Intl.NumberFormat(localeIntl(locale), { maximumFractionDigits: 3 }).format(n);
  } catch {
    return String(n);
  }
}

export function SaldoCorridoCell({ direccion, cantidad, saldo, unidad, costoPromedio, alineacion = 'derecha', className }: SaldoCorridoCellProps) {
  const t = useTranslations('inventario.saldo');
  const locale = useLocale();
  const entrada = direccion === 'in';
  const signo = entrada ? '+' : '−';
  const negativo = typeof saldo === 'number' && saldo < 0;
  const sufijo = unidad ? ` ${unidad}` : '';
  return (
    <div className={cn('flex flex-col gap-0.5 tabular-nums', alineacion === 'derecha' ? 'items-end text-right' : 'items-start', className)}>
      <span
        className={cn('text-sm font-semibold', entrada ? 'text-success-text' : 'text-danger-text')}
        aria-label={`${entrada ? t('entrada') : t('salida')} ${formatearCantidad(Math.abs(cantidad), locale)}${sufijo}`}
      >
        {signo}
        {formatearCantidad(Math.abs(cantidad), locale)}
        {sufijo}
      </span>
      {typeof saldo === 'number' && (
        <span
          className={cn('text-xs', negativo ? 'font-medium text-danger-text' : 'text-fg-secondary')}
          title={negativo ? t('negativo') : undefined}
        >
          {t('saldoTras', { saldo: `${formatearCantidad(saldo, locale)}${sufijo}` })}
        </span>
      )}
      {costoPromedio && (
        <span className="text-xs text-fg-muted">
          {t('costoPromedio')}: {costoPromedio}
        </span>
      )}
    </div>
  );
}
