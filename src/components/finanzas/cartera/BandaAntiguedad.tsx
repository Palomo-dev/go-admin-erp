'use client';

/**
 * Banda de antigüedad de cartera (captura `26-cartera-01-cobrar-listado.png`):
 * cinco tramos (al día · 1-30 · 31-60 · 61-90 · > 90) con saldo y número de
 * cuentas; cada tramo filtra el listado. Sirve a cuentas por cobrar (Finanzas y
 * POS) y por pagar: solo pinta lo que le llega (`resumirAntiguedad` o la RPC).
 *
 * Accesible: un grupo de botones conmutables (`aria-pressed`) con el saldo en
 * el nombre accesible; la barra proporcional es decorativa.
 */
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { TRAMOS_ANTIGUEDAD, type TramoAntiguedad } from '@/lib/finanzas/cartera/antiguedad';

export interface BandaAntiguedadProps {
  tramos: readonly { tramo: TramoAntiguedad; saldo: number; cuentas: number }[];
  formatear: (valor: number) => string;
  seleccionado?: TramoAntiguedad | null;
  onSeleccionar?: (tramo: TramoAntiguedad | null) => void;
  cargando?: boolean;
  className?: string;
}

const TONO: Record<TramoAntiguedad, string> = {
  al_dia: 'bg-success',
  d1_30: 'bg-warning',
  d31_60: 'bg-warning-text',
  d61_90: 'bg-danger',
  d90_mas: 'bg-danger-text',
};

export function BandaAntiguedad({ tramos, formatear, seleccionado, onSeleccionar, cargando, className }: BandaAntiguedadProps) {
  const t = useTranslations('cartera.antiguedad');
  const porTramo = new Map(tramos.map((x) => [x.tramo, x]));
  const total = tramos.reduce((s, x) => s + Math.max(x.saldo, 0), 0);

  return (
    <section aria-label={t('etiqueta')} className={cn('rounded-xl border border-line bg-surface p-3 sm:p-4', className)}>
      <div aria-hidden="true" className="mb-3 flex h-2 w-full overflow-hidden rounded-full bg-subtle">
        {TRAMOS_ANTIGUEDAD.map((tramo) => {
          const saldo = porTramo.get(tramo)?.saldo ?? 0;
          const ancho = total > 0 ? (saldo / total) * 100 : 0;
          return ancho > 0 ? <span key={tramo} className={TONO[tramo]} style={{ width: `${ancho}%` }} /> : null;
        })}
      </div>
      <div role="group" aria-label={t('filtrar')} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {TRAMOS_ANTIGUEDAD.map((tramo) => {
          const dato = porTramo.get(tramo) ?? { saldo: 0, cuentas: 0 };
          const activo = seleccionado === tramo;
          return (
            <button
              key={tramo}
              type="button"
              aria-pressed={activo}
              disabled={cargando || !onSeleccionar}
              onClick={() => onSeleccionar?.(activo ? null : tramo)}
              className={cn(
                'flex min-w-0 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default',
                activo ? 'border-line-brand bg-brand-tint' : 'border-line bg-surface hover:bg-hover',
              )}
            >
              <span className="flex items-center gap-1.5 text-xs text-fg-secondary">
                <span aria-hidden="true" className={cn('size-2 rounded-full', TONO[tramo])} />
                {t(`tramos.${tramo}`)}
              </span>
              <span className={cn('truncate text-sm font-semibold tabular-nums text-fg', cargando && 'animate-pulse text-fg-muted')}>
                {cargando ? '—' : formatear(dato.saldo)}
              </span>
              <span className="text-xs text-fg-muted">{t('cuentas', { count: dato.cuentas })}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
