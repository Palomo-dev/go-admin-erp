'use client';

/**
 * Barra de cuadre (Figma `kit/contabilidad · BarraCuadre` 978:605283):
 * «Débitos $ X · Créditos $ Y · Cuadra» o, en rojo, «Diferencia $ Z».
 * Débito y crédito van en texto normal: el rojo es solo para la diferencia.
 */
import { useTranslations } from 'next-intl';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Cuadre } from '@/lib/finanzas/contabilidad/cuadre';

export interface BarraCuadreProps {
  cuadre: Cuadre;
  formatear: (valor: number) => string;
  className?: string;
}

export function BarraCuadre({ cuadre, formatear, className }: BarraCuadreProps) {
  const t = useTranslations('finanzasContabilidadR3.comun.cuadre');
  const descuadra = !cuadre.vacio && !cuadre.cuadra;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border px-4 py-3 text-sm',
        descuadra ? 'border-line-danger bg-danger-subtle' : cuadre.cuadra ? 'border-line-success bg-success-subtle' : 'border-line bg-subtle',
        className,
      )}
    >
      <span className="flex flex-wrap gap-x-6 gap-y-1">
        <span>
          <span className="text-fg-secondary">{t('debitos')}</span>{' '}
          <span className="font-semibold tabular-nums text-fg">{formatear(cuadre.debitos)}</span>
        </span>
        <span>
          <span className="text-fg-secondary">{t('creditos')}</span>{' '}
          <span className="font-semibold tabular-nums text-fg">{formatear(cuadre.creditos)}</span>
        </span>
      </span>
      {descuadra ? (
        <span className="inline-flex items-center gap-1.5 font-semibold text-danger-text">
          <CircleAlert aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('diferencia', { valor: formatear(Math.abs(cuadre.diferencia)) })}
        </span>
      ) : cuadre.cuadra ? (
        <span className="inline-flex items-center gap-1.5 font-semibold text-success-text">
          <CircleCheck aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('cuadra')}
        </span>
      ) : (
        <span className="text-fg-muted">{t('sinImportes')}</span>
      )}
    </div>
  );
}
