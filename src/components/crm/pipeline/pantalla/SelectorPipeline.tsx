'use client';

import { useTranslations } from 'next-intl';
import { Check, ChevronDown, Kanban, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { formatMoneda } from '@/lib/utils/moneda';
import { cn } from '@/utils/Utils';

/**
 * Selector de embudo (Figma 812:54821): pipelines de la organización con su
 * tipo y cuántas etapas tienen, «Nuevo pipeline», «Usar como por defecto»,
 * «Editar etapas» y «Eliminar pipeline». Lo que no se puede hacer se ve
 * deshabilitado CON su motivo (ya es el por defecto; tiene oportunidades; sin
 * permiso). Los permisos llegan resueltos del servidor. Cada embudo dice sus
 * abiertas y su valor en la moneda base (`GET /api/crm/pipelines?resumen=1`).
 */
export interface PipelineSelector {
  id: string;
  name: string;
  pipeline_type?: string | null;
  is_default?: boolean | null;
  stages?: readonly unknown[] | null;
}

/** Abiertas de un pipeline ya en la moneda base (`abiertasDePipeline`). */
export interface AbiertasSelector {
  cantidad: number;
  total: number | null;
  base: string;
  sinTasa: number;
}

/**
 * Línea de detalle de un embudo: «23 abiertas · $ 184.500.000 · 9 etapas»
 * (Figma 1821:189325). Sin resumen (cargando o falló) queda «9 etapas»; el
 * monto se omite si ninguna abierta se pudo convertir a la base.
 */
export function lineaPipeline(t: (clave: string, valores?: Record<string, string | number>) => string, x: PipelineSelector, a: AbiertasSelector | null | undefined): string {
  const partes: string[] = [];
  if (a) {
    partes.push(t('abiertas', { n: a.cantidad }));
    if (a.cantidad > 0 && a.total !== null) partes.push(formatMoneda(a.total, a.base));
  }
  partes.push(t('etapas', { n: x.stages?.length ?? 0 }));
  return partes.join(' · ');
}

export interface SelectorPipelineProps {
  pipelines: readonly PipelineSelector[];
  /** «N abiertas · monto» de cada embudo; sin él solo se cuentan las etapas. */
  abiertas?: (pipelineId: string) => AbiertasSelector | null;
  actualId: string | null;
  onElegir: (id: string) => void;
  /** Oportunidades del pipeline actual (guarda de «Eliminar»). */
  oportunidadesActual: number | null;
  puedeGestionar: boolean;
  puedeGestionarEtapas: boolean;
  onNuevo: () => void;
  onPorDefecto: () => void;
  onEditarEtapas: () => void;
  onEliminar: () => void;
  className?: string;
}

/** Tipo del pipeline → clave de `crm.oportunidad.selector.tipos` (también lo usa la hoja móvil). */
export const TIPO: Record<string, 'ventas' | 'onboarding' | 'renovacion'> = { sales: 'ventas', onboarding: 'onboarding', renewal: 'renovacion' };

export function SelectorPipeline(p: SelectorPipelineProps) {
  const t = useTranslations('crm.oportunidad.selector');
  const actual = p.pipelines.find((x) => x.id === p.actualId);
  const esDefecto = !!actual?.is_default;
  const conOportunidades = (p.oportunidadesActual ?? 0) > 0;
  const item = 'flex items-start gap-2 px-3 py-2 text-sm';
  const motivo = (texto: string) => <span className="block text-xs text-fg-muted">{texto}</span>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t('aria', { nombre: actual?.name ?? '' })} className={cn('inline-flex h-10 min-w-0 items-center justify-between gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:w-80', p.className)}>
          <span className="truncate">{actual ? (actual.is_default ? t('conDefecto', { nombre: actual.name }) : actual.name) : t('elegir')}</span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 p-1">
        <DropdownMenuLabel className="text-xs text-fg-secondary">{t('titulo')}</DropdownMenuLabel>
        {p.pipelines.map((x) => (
          <DropdownMenuItem key={x.id} onSelect={() => p.onElegir(x.id)} className={cn(item, x.id === p.actualId && 'bg-brand-tint')}>
            <Kanban aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-muted" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2">
                <span className="truncate font-medium">{x.name}</span>
                {x.is_default ? <Badge tono="marca" tamano="sm">{t('porDefecto')}</Badge> : x.pipeline_type && TIPO[x.pipeline_type] ? <Badge tono="neutro" tamano="sm">{t(`tipos.${TIPO[x.pipeline_type]}`)}</Badge> : null}
              </span>
              <span className="text-xs text-fg-secondary">{lineaPipeline(t, x, p.abiertas?.(x.id))}</span>
            </span>
            {x.id === p.actualId && <Check aria-hidden="true" className="size-4 text-brand" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!p.puedeGestionar} onSelect={p.onNuevo} className={item}>
          <Plus aria-hidden="true" className="mt-0.5 size-4" />
          <span>{t('nuevo')}{motivo(p.puedeGestionar ? t('nuevoDetalle') : t('sinPermiso'))}</span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!p.puedeGestionar || esDefecto || !actual} onSelect={p.onPorDefecto} className={item}>
          <Star aria-hidden="true" className="mt-0.5 size-4" />
          <span>{t('usarDefecto', { nombre: actual?.name ?? '' })}{motivo(esDefecto ? t('yaDefecto') : !p.puedeGestionar ? t('sinPermiso') : t('usarDefectoDetalle'))}</span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!p.puedeGestionarEtapas || !actual} onSelect={p.onEditarEtapas} className={item}>
          <Pencil aria-hidden="true" className="mt-0.5 size-4" />
          <span>{t('editarEtapas')}{!p.puedeGestionarEtapas && motivo(t('sinPermiso'))}</span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!p.puedeGestionar || conOportunidades || !actual} onSelect={p.onEliminar} className={cn(item, 'text-danger-text')}>
          <Trash2 aria-hidden="true" className="mt-0.5 size-4" />
          <span>{t('eliminar')}{motivo(conOportunidades ? t('noEliminable', { n: p.oportunidadesActual ?? 0 }) : !p.puedeGestionar ? t('sinPermiso') : t('eliminarDetalle'))}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
