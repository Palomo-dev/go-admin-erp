'use client';

/**
 * Banda de antigüedad de la cartera por pagar (plan F8): al día, 1–30, 31–60,
 * 61–90 y más de 90 días vencidos. Cada tramo es un botón que filtra el
 * listado; la barra proporcional es decorativa (la cifra va en el texto).
 *
 * Vive aquí mientras el kit no tenga una pieza equivalente: pedida al agente
 * del kit para que CxC y CxP compartan la misma.
 */
import { useTranslations } from 'next-intl';
import type { TramoCxp } from '@/lib/services/compras/lecturasCompras';

export const TRAMOS_CXP: readonly TramoCxp[] = ['al_dia', 'd1_30', 'd31_60', 'd61_90', 'd90_mas'];

const COLOR: Record<TramoCxp, string> = {
  al_dia: 'bg-success',
  d1_30: 'bg-warning',
  d31_60: 'bg-danger/50',
  d61_90: 'bg-danger/75',
  d90_mas: 'bg-danger',
};

export interface BandaAntiguedadProps {
  tramos: Record<TramoCxp, number> | null;
  formatear: (valor: number) => string;
  activo: string | null;
  onElegir: (tramo: TramoCxp | null) => void;
}

export function BandaAntiguedad({ tramos, formatear, activo, onElegir }: BandaAntiguedadProps) {
  const t = useTranslations('cuentasPorPagar.antiguedad');
  const total = tramos ? TRAMOS_CXP.reduce((s, k) => s + (tramos[k] ?? 0), 0) : 0;

  return (
    <section aria-label={t('titulo')} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">{t('titulo')}</h2>
        {activo && (
          <button
            type="button"
            onClick={() => onElegir(null)}
            className="text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {t('quitar')}
          </button>
        )}
      </div>
      <div aria-hidden="true" className="flex h-2 w-full overflow-hidden rounded-full bg-subtle">
        {tramos &&
          total > 0 &&
          TRAMOS_CXP.map((k) =>
            tramos[k] > 0 ? <span key={k} className={COLOR[k]} style={{ width: `${(tramos[k] / total) * 100}%` }} /> : null,
          )}
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {TRAMOS_CXP.map((k) => (
          <li key={k}>
            <button
              type="button"
              aria-pressed={activo === k}
              onClick={() => onElegir(activo === k ? null : k)}
              className={`flex w-full flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                activo === k ? 'border-brand-action bg-brand-tint' : 'border-line hover:bg-hover'
              }`}
            >
              <span className="flex items-center gap-1.5 text-xs text-fg-secondary">
                <span aria-hidden="true" className={`size-2 rounded-full ${COLOR[k]}`} />
                {t(`tramos.${k}`)}
              </span>
              <span className="text-sm font-semibold tabular-nums text-fg">{tramos ? formatear(tramos[k] ?? 0) : '—'}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
