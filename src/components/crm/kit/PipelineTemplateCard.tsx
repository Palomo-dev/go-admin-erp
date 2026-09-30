'use client';

import { useTranslations } from 'next-intl';
import { Check, Info, Layers, TrendingUp, Trophy, XCircle } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { PipelineTemplate } from '@/lib/services/crm/pipelineTemplates';
import { avisoPlantilla, clavePlantilla, etapasDePlantilla, rangoSla } from './pipelineTemplateCardLogica';

/**
 * Tarjeta de la galería «Nuevo pipeline» (Figma `PipelineTemplateCard`
 * 800:25326): nombre, tipo, descripción, barra de colores, etapas con su
 * probabilidad (trofeo = ganada, X = perdida), aviso y pie con número de
 * etapas y rango de SLA. Es un `radio` dentro del `radiogroup` de la galería:
 * la pantalla pone el grupo y el foco con flechas.
 */
export interface PipelineTemplateCardProps {
  plantilla: Pick<PipelineTemplate, 'key' | 'pipeline_type' | 'stages'>;
  seleccionada?: boolean;
  onSeleccionar: () => void;
  /** `pipelines.pipeline_type` que ya tiene la organización. */
  tiposExistentes?: readonly (string | null)[];
  tabIndex?: number;
  className?: string;
}

export function PipelineTemplateCard({ plantilla, seleccionada, onSeleccionar, tiposExistentes = [], tabIndex, className }: PipelineTemplateCardProps) {
  const t = useTranslations('crm.kit.plantilla');
  const clave = clavePlantilla(plantilla.key);
  const etapas = etapasDePlantilla(plantilla, { ganada: t('ganada'), perdida: t('perdida') });
  const sla = rangoSla(etapas);
  const aviso = avisoPlantilla(plantilla, etapas, tiposExistentes);
  const nombre = t(`nombres.${clave}`);

  return (
    <button
      type="button"
      role="radio"
      aria-checked={!!seleccionada}
      aria-label={nombre}
      tabIndex={tabIndex}
      onClick={onSeleccionar}
      className={cn(
        'flex w-full flex-col gap-3 rounded-xl border bg-surface p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        seleccionada ? 'border-brand-action ring-1 ring-brand-action' : 'border-line hover:border-line-strong',
        className,
      )}
    >
      <span className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-fg">
          <TrendingUp className="size-5" strokeWidth={1.5} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-base font-semibold text-fg">{nombre}</span>
          <span className="text-xs text-fg-secondary">{plantilla.pipeline_type ? t('tipo', { tipo: t(`tipos.${clave}`) }) : t('tuEliges')}</span>
        </span>
        {seleccionada && (
          <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full bg-brand-action text-fg-on-brand">
            <Check className="size-4" strokeWidth={2} />
          </span>
        )}
      </span>
      <span className="text-[13px] leading-[18px] text-fg-secondary">{t(`descripciones.${clave}`)}</span>
      <span aria-hidden="true" className="flex gap-1">
        {etapas.map((e) => <span key={e.name} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: e.color }} />)}
      </span>
      <span className="flex flex-col gap-1.5">
        {etapas.map((e) => (
          <span key={e.name} className="flex items-center gap-2 text-[13px] text-fg">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
            <span className="flex-1 truncate">{e.name}</span>
            {e.is_won && <Trophy aria-label={t('etapaGanada')} className="size-3.5 text-fg-secondary" />}
            {e.is_lost && <XCircle aria-label={t('etapaPerdida')} className="size-3.5 text-fg-secondary" />}
            <span className="w-10 text-right text-fg-secondary">{e.probability} %</span>
          </span>
        ))}
      </span>
      {aviso && (
        <span className="flex items-start gap-1.5 rounded-lg bg-warning-subtle px-2 py-1.5 text-xs text-warning-text">
          <Info aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {t(`aviso.${aviso}`)}
        </span>
      )}
      <span className="flex items-center gap-1.5 border-t border-line pt-2 text-xs text-fg-secondary">
        <Layers aria-hidden="true" className="size-3.5" />
        {plantilla.key === 'blank' ? t('etapasCierre', { n: etapas.length }) : sla ? t('pieSla', { n: etapas.length, min: sla.min, max: sla.max }) : t('etapas', { n: etapas.length })}
      </span>
    </button>
  );
}
