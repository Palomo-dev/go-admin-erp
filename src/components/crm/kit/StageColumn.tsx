'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Ellipsis, Plus } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Badge } from '@/components/ui/badge';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { colorEtapa, estadoColumna, probabilidadEtapa, type EtapaColumna, type TotalColumna } from './stageColumnLogica';

/**
 * Columna del kanban (Figma `StageColumn` 759:22544; conserva `KanbanColumnV2`):
 * color, nombre, conteo, «+» para crear en esta etapa y «⋯» para configurarla;
 * total en la moneda base con aviso si incluye monedas convertidas.
 *
 * Estados: normal · destino (arrastrando encima: «Soltar aquí» y la
 * probabilidad que tomará) · vacía («Crear aquí») · cargando (esqueleto).
 * Las tarjetas llegan como `children`; el arrastre es de la pantalla.
 */
export interface StageColumnProps {
  etapa: EtapaColumna;
  cantidad: number;
  total: TotalColumna;
  monedaBase: ContextoMoneda;
  cargando?: boolean;
  /** Una tarjeta se arrastra encima. */
  destino?: boolean;
  /** Sin permiso de crear: sin «+» ni «Crear aquí». */
  puedeCrear?: boolean;
  onCrear?: (etapaId: string) => void;
  /** Sin permiso de gestionar etapas: sin «⋯». */
  onConfigurar?: (etapaId: string) => void;
  children?: ReactNode;
  className?: string;
}

export function StageColumn({
  etapa,
  cantidad,
  total,
  monedaBase,
  cargando,
  destino,
  puedeCrear = true,
  onCrear,
  onConfigurar,
  children,
  className,
}: StageColumnProps) {
  const t = useTranslations('crm.kit.columna');
  const estado = estadoColumna({ cargando, destino, cantidad });
  const prob = probabilidadEtapa(etapa.probability);
  const color = colorEtapa(etapa.color);
  const botonIcono =
    'flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

  return (
    <section
      aria-label={t('aria', { etapa: etapa.name, cantidad })}
      aria-busy={estado === 'cargando' || undefined}
      data-estado={estado}
      className={cn(
        'flex w-[296px] shrink-0 flex-col gap-2 rounded-xl border p-2',
        estado === 'destino' ? 'border-brand-action bg-brand-tint' : 'border-transparent bg-subtle',
        className,
      )}
    >
      <header className="flex flex-col gap-1 px-1 pt-1">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', !color && 'bg-brand')} style={color ? { backgroundColor: color } : undefined} />
          <h3 className="truncate text-sm font-semibold text-fg">{etapa.name}</h3>
          <Badge tono="neutro" tamano="sm" aria-label={t('conteo', { cantidad })}>
            {cantidad}
          </Badge>
          <span className="flex-1" />
          {puedeCrear && onCrear && (
            <button type="button" aria-label={t('crearEn', { etapa: etapa.name })} onClick={() => onCrear(etapa.id)} className={botonIcono}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          )}
          {onConfigurar && (
            <button type="button" aria-label={t('configurar', { etapa: etapa.name })} onClick={() => onConfigurar(etapa.id)} className={botonIcono}>
              <Ellipsis aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13px] font-semibold text-fg">{formatMoneda(total.resumen.total, monedaBase)}</span>
          <span className="text-xs text-fg-muted">
            {prob === null ? monedaBase.code : t('monedaYProb', { moneda: monedaBase.code, prob })}
          </span>
          {total.incluye && estado !== 'destino' && (
            <Badge tono="informacion" tamano="sm">
              {t('incluye', { cantidad: total.incluye.cantidad, moneda: total.incluye.moneda })}
            </Badge>
          )}
          {total.sinTasa > 0 && (
            <Badge tono="advertencia" tamano="sm">
              {t('sinTasa', { cantidad: total.sinTasa })}
            </Badge>
          )}
        </div>
      </header>

      {estado === 'cargando' ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-[72px] animate-pulse rounded-xl border border-line bg-surface" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">{children}</div>
      )}

      {estado === 'destino' && (
        <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-brand-action bg-surface px-3 py-6 text-center">
          <span className="text-[13px] font-medium text-brand-action">{t('soltarAqui')}</span>
          <span className="text-xs text-fg-secondary">
            {prob === null ? t('pasaA', { etapa: etapa.name }) : t('pasaAProb', { etapa: etapa.name, prob })}
          </span>
        </div>
      )}

      {estado === 'vacia' && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-3 py-5 text-center">
          <span className="text-[13px] text-fg-secondary">{t('vacia')}</span>
          {puedeCrear && onCrear && (
            <button
              type="button"
              onClick={() => onCrear(etapa.id)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('crearAqui')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
