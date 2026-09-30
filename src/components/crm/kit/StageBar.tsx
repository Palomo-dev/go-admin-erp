'use client';

import { useTranslations } from 'next-intl';
import { Check, ChevronDown, Trophy, XCircle } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { vistaBarra, type EtapaBarra } from './stageBarLogica';

/**
 * Barra de etapas clicable (Figma `StageBar` 801:25456; reemplaza
 * `StageSelect.tsx`): un segmento por etapa abierta con su probabilidad, y
 * «Ganada» / «Perdida» aparte (abren `WinDialog` / `LoseDialog`). Cada clic
 * lo resuelve la pantalla por `PATCH …/stage` (mismo servicio con requisitos).
 * En móvil (`layout='movil'`): etapa actual, «2 de 3» y un toque abre la hoja
 * de etapas.
 */
export interface StageBarProps {
  etapas: readonly EtapaBarra[];
  actualId: string;
  onElegir?: (etapa: EtapaBarra) => void;
  onGanar?: (etapa: EtapaBarra) => void;
  onPerder?: (etapa: EtapaBarra) => void;
  onAbrirHoja?: () => void;
  layout?: 'escritorio' | 'movil';
  /** Sin permiso de mover: se ve pero no se pulsa. */
  soloLectura?: boolean;
  className?: string;
}

export function StageBar({ etapas, actualId, onElegir, onGanar, onPerder, onAbrirHoja, layout = 'escritorio', soloLectura, className }: StageBarProps) {
  const t = useTranslations('crm.kit.barraEtapas');
  const v = vistaBarra(etapas, actualId);

  if (layout === 'movil') {
    const etiqueta = v.actual ? (v.actual.probability === null ? v.actual.name : t('etapaProb', { etapa: v.actual.name, prob: v.actual.probability })) : '—';
    return (
      <button type="button" onClick={onAbrirHoja} disabled={soloLectura} aria-haspopup="dialog" aria-label={t('abrirEtapas', { etapa: etiqueta })} className={cn('flex w-full flex-col gap-2 rounded-lg p-2 text-left hover:bg-hover disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand', className)}>
        <span className="flex items-center gap-2 text-sm">
          <span aria-hidden="true" className="size-2 rounded-full bg-brand-action" />
          <span className="flex-1 font-medium text-fg">{etiqueta}</span>
          {v.estado === 'abierta' && <span className="text-xs text-fg-secondary">{t('posicion', { i: v.indice, n: v.total })}</span>}
          <ChevronDown aria-hidden="true" className="size-4 text-fg-muted" />
        </span>
        <span aria-hidden="true" className="flex gap-1">
          {v.segmentos.map((s) => <span key={s.etapa.id} className={cn('h-1.5 flex-1 rounded-full', s.estado === 'futura' ? 'bg-line' : 'bg-brand-action')} />)}
        </span>
      </button>
    );
  }

  return (
    <nav aria-label={t('aria')} className={cn('flex items-center gap-3', className)}>
      <ol className="flex min-w-0 flex-1 gap-1">
        {v.segmentos.map(({ etapa, estado }) => (
          <li key={etapa.id} className="min-w-0 flex-1">
            <button
              type="button"
              aria-current={estado === 'actual' ? 'step' : undefined}
              disabled={soloLectura || estado === 'actual'}
              onClick={() => onElegir?.(etapa)}
              className="group flex w-full flex-col gap-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default"
            >
              <span aria-hidden="true" className={cn('h-1.5 w-full rounded-full', estado === 'futura' ? 'bg-line group-enabled:group-hover:bg-line-strong' : 'bg-brand-action')} />
              <span className={cn('flex items-center gap-1 text-xs', estado === 'actual' ? 'font-semibold text-brand-deep' : 'text-fg-secondary')}>
                {estado === 'pasada' && <Check aria-hidden="true" className="size-3.5 shrink-0" />}
                <span className="truncate">{etapa.name}</span>
                <span className="flex-1" />
                {etapa.probability !== null && <span className="shrink-0 text-fg-muted">{etapa.probability} %</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {v.ganada && (
        <button type="button" disabled={soloLectura || v.estado === 'ganada'} aria-pressed={v.estado === 'ganada'} onClick={() => v.ganada && onGanar?.(v.ganada)} className={cn('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium disabled:cursor-default', v.estado === 'ganada' ? 'border-transparent bg-success-subtle text-success-text' : 'border-line-success text-success-text hover:bg-success-subtle')}>
          <Trophy aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {v.ganada.name}
        </button>
      )}
      {v.perdida && (
        <button type="button" disabled={soloLectura || v.estado === 'perdida'} aria-pressed={v.estado === 'perdida'} onClick={() => v.perdida && onPerder?.(v.perdida)} className={cn('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium disabled:cursor-default', v.estado === 'perdida' ? 'border-transparent bg-danger-subtle text-danger-text' : 'border-line-danger text-danger-text hover:bg-danger-subtle')}>
          <XCircle aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {v.perdida.name}
        </button>
      )}
    </nav>
  );
}
