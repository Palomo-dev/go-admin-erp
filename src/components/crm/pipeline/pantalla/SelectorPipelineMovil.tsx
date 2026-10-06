'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Kanban, Pencil, Plus, Star, type LucideIcon } from 'lucide-react';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import { lineaPipeline, TIPO, type AbiertasSelector, type PipelineSelector } from './SelectorPipeline';

/**
 * Selector de embudo en móvil (Figma CRM 1815:175513, hoja 1821:189325): el
 * título «<pipeline> ▾» de la cabecera abre esta hoja con los pipelines de la
 * organización (marca «Por defecto» o el tipo, cuántas etapas y ✓ en el
 * actual) y las acciones «Nuevo pipeline», «Editar etapas» y «Usar como por
 * defecto», deshabilitadas CON su motivo como en el selector de escritorio.
 *
 * Cada embudo dice «N abiertas · monto · N etapas» con el resumen de
 * `GET /api/crm/pipelines?resumen=1` (monto en la moneda base).
 */
export interface SelectorPipelineMovilProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  pipelines: readonly PipelineSelector[];
  abiertas?: (pipelineId: string) => AbiertasSelector | null;
  actualId: string | null;
  onElegir: (id: string) => void;
  puedeGestionar: boolean;
  puedeGestionarEtapas: boolean;
  onNuevo: () => void;
  onPorDefecto: () => void;
  onEditarEtapas: () => void;
}

function FilaAccion({ icono: Icono, etiqueta, detalle, deshabilitada, onClick }: { icono: LucideIcon; etiqueta: ReactNode; detalle?: string; deshabilitada: boolean; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        disabled={deshabilitada}
        onClick={onClick}
        className="flex min-h-[52px] w-full items-start gap-4 rounded-lg px-2 py-2 text-left text-[15px] text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Icono aria-hidden="true" className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} />
        <span className="flex min-w-0 flex-col">
          <span>{etiqueta}</span>
          {detalle && <span className="text-xs text-fg-secondary">{detalle}</span>}
        </span>
      </button>
    </li>
  );
}

export function SelectorPipelineMovil(p: SelectorPipelineMovilProps) {
  const t = useTranslations('crm.oportunidad.selector');
  const actual = p.pipelines.find((x) => x.id === p.actualId);
  const esDefecto = !!actual?.is_default;
  // Cierra la hoja y, tras la animación, lanza la acción (que puede abrir un diálogo y tomar el foco).
  const tras = (accion: () => void) => () => {
    p.onAbiertoChange(false);
    setTimeout(accion, 0);
  };

  return (
    <PanelAdaptable abierto={p.abierto} onAbiertoChange={p.onAbiertoChange} titulo={t('titulo')}>
      <ul aria-label={t('titulo')} className="-mx-2 flex flex-col gap-1">
        {p.pipelines.map((x) => {
          const esActual = x.id === p.actualId;
          return (
            <li key={x.id}>
              <button
                type="button"
                aria-current={esActual ? 'true' : undefined}
                onClick={tras(() => p.onElegir(x.id))}
                className={cn(
                  'flex min-h-[60px] w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  esActual && 'bg-brand-tint',
                )}
              >
                <Kanban aria-hidden="true" className="size-5 shrink-0 text-fg-muted" strokeWidth={1.5} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[15px] font-medium text-fg">{x.name}</span>
                    {x.is_default ? (
                      <Badge tono="marca" tamano="sm">{t('porDefecto')}</Badge>
                    ) : x.pipeline_type && TIPO[x.pipeline_type] ? (
                      <Badge tono="neutro" tamano="sm">{t(`tipos.${TIPO[x.pipeline_type]}`)}</Badge>
                    ) : null}
                  </span>
                  <span className="text-[13px] text-fg-secondary">{lineaPipeline(t, x, p.abiertas?.(x.id))}</span>
                </span>
                {esActual && <Check aria-hidden="true" className="size-5 shrink-0 text-brand" />}
              </button>
            </li>
          );
        })}
      </ul>
      <div role="separator" className="h-px bg-line" />
      <ul className="-mx-2 flex flex-col gap-1">
        <FilaAccion icono={Plus} etiqueta={t('nuevo')} detalle={p.puedeGestionar ? t('nuevoDetalle') : t('sinPermiso')} deshabilitada={!p.puedeGestionar} onClick={tras(p.onNuevo)} />
        <FilaAccion icono={Pencil} etiqueta={t('editarEtapas')} detalle={!p.puedeGestionarEtapas ? t('sinPermiso') : undefined} deshabilitada={!p.puedeGestionarEtapas || !actual} onClick={tras(p.onEditarEtapas)} />
        <FilaAccion
          icono={Star}
          etiqueta={t('usarDefecto', { nombre: actual?.name ?? '' })}
          detalle={esDefecto ? t('yaDefecto') : !p.puedeGestionar ? t('sinPermiso') : t('usarDefectoDetalle')}
          deshabilitada={!p.puedeGestionar || esDefecto || !actual}
          onClick={tras(p.onPorDefecto)}
        />
      </ul>
    </PanelAdaptable>
  );
}
