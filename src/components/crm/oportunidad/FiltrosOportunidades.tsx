'use client';

import { useTranslations } from 'next-intl';
import { FilterPanel } from '@/components/kit/FilterPanel';
import { FilterChip } from '@/components/kit/FilterChip';
import { FormField } from '@/components/kit/FormField';
import { clasesBoton } from '@/components/kit/botonClases';
import { cn } from '@/utils/Utils';
import type { OpcionUsuario } from '@/components/crm/kit/camposCrm';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { alternarPrioridad, contarFiltros, filtrosVacios, PRESETS_CIERRE, PRIORIDADES, quitarFiltro, type FiltrosOportunidades as Filtros, type PresetCierre } from './filtrosLogica';

/**
 * Filtros de Pipeline y Oportunidades (Figma 768:454894 botón, 768:454922
 * chips; 773:23160 lista): responsable, cierre esperado y prioridad (D4:
 * temperatura). En la lista, además, embudo y etapa. Popover en escritorio y
 * hoja en móvil (`FilterPanel` del kit). Se filtra en el servidor.
 */
export interface FiltrosOportunidadesProps {
  filtros: Filtros;
  onFiltros: (f: Filtros) => void;
  usuarios: readonly OpcionUsuario[];
  /** Solo la lista: embudo y etapa. */
  pipelines?: readonly { id: string; name: string }[];
  etapas?: readonly { id: string; name: string; pipeline_id?: string }[];
}

export function FiltrosOportunidades({ filtros, onFiltros, usuarios, pipelines, etapas }: FiltrosOportunidadesProps) {
  const t = useTranslations('crm.oportunidad.filtros');
  const tp = useTranslations('crm.kit.tarjeta.prioridad');
  const cambiar = (p: Partial<Filtros>) => onFiltros({ ...filtros, ...p });
  const conPipeline = !!pipelines;
  const etapasVisibles = (etapas ?? []).filter((e) => !filtros.pipelineId || e.pipeline_id === filtros.pipelineId);
  return (
    <FilterPanel conteo={contarFiltros(filtros, conPipeline)} onLimpiar={() => onFiltros({ ...filtrosVacios(), q: filtros.q, pipelineId: conPipeline ? '' : filtros.pipelineId })} titulo={t('titulo')} etiquetaBoton={t('boton')}>
      {pipelines && (
        <FormField etiqueta={t('embudo')}>
          <SelectCrm valor={filtros.pipelineId} onValorChange={(pipelineId) => cambiar({ pipelineId, etapaId: '' })} opcionVacia={t('todos')} opciones={pipelines.map((p) => ({ valor: p.id, etiqueta: p.name }))} />
        </FormField>
      )}
      {etapas && (
        <FormField etiqueta={t('etapa')}>
          <SelectCrm valor={filtros.etapaId} onValorChange={(etapaId) => cambiar({ etapaId })} opcionVacia={t('todas')} opciones={etapasVisibles.map((e) => ({ valor: e.id, etiqueta: e.name }))} />
        </FormField>
      )}
      <FormField etiqueta={t('responsable')}>
        <SelectCrm
          valor={filtros.responsable}
          onValorChange={(responsable) => cambiar({ responsable })}
          opcionVacia={t('todos')}
          opciones={[{ valor: 'yo', etiqueta: t('yo') }, { valor: 'ninguno', etiqueta: t('sinAsignar') }, ...usuarios.map((u) => ({ valor: u.id, etiqueta: u.nombre }))]}
        />
      </FormField>
      <FormField etiqueta={t('cierre')}>
        <SelectCrm valor={filtros.cierre} onValorChange={(cierre) => cambiar({ cierre: cierre as PresetCierre })} opcionVacia={t('cualquierFecha')} opciones={PRESETS_CIERRE.map((p) => ({ valor: p, etiqueta: t(`preset.${p}`) }))} />
      </FormField>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[13px] font-medium text-fg">{t('prioridad')}</legend>
        <div className="flex flex-wrap gap-2">
          {PRIORIDADES.map((p) => {
            const activo = filtros.prioridades.includes(p);
            return (
              <button key={p} type="button" aria-pressed={activo} onClick={() => onFiltros(alternarPrioridad(filtros, p))} className={cn('inline-flex h-8 items-center rounded-full border px-3 text-[13px]', activo ? 'border-brand bg-brand-tint text-brand-deep' : 'border-line-strong text-fg hover:bg-hover')}>
                {tp(p)}
              </button>
            );
          })}
        </div>
      </fieldset>
    </FilterPanel>
  );
}

/** Chips de los filtros activos + «Limpiar filtros» (Figma 768:454922). */
export function ChipsFiltrosOportunidades({ filtros, onFiltros, usuarios, pipelines, etapas }: FiltrosOportunidadesProps) {
  const t = useTranslations('crm.oportunidad.filtros');
  const tp = useTranslations('crm.kit.tarjeta.prioridad');
  const conPipeline = !!pipelines;
  if (contarFiltros(filtros, conPipeline) === 0) return null;
  const responsable =
    filtros.responsable === 'yo' ? t('yo') : filtros.responsable === 'ninguno' ? t('sinAsignar') : usuarios.find((u) => u.id === filtros.responsable)?.nombre ?? '—';
  const quitar = (c: Parameters<typeof quitarFiltro>[1]) => onFiltros(quitarFiltro(filtros, c));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {conPipeline && filtros.pipelineId && <FilterChip etiqueta={t('chipEmbudo', { nombre: pipelines?.find((p) => p.id === filtros.pipelineId)?.name ?? '—' })} onQuitar={() => quitar('pipeline')} />}
      {filtros.etapaId && <FilterChip etiqueta={t('chipEtapa', { nombre: etapas?.find((e) => e.id === filtros.etapaId)?.name ?? '—' })} onQuitar={() => quitar('etapa')} />}
      {filtros.responsable && <FilterChip etiqueta={t('chipResponsable', { nombre: responsable })} onQuitar={() => quitar('responsable')} />}
      {filtros.cierre && <FilterChip etiqueta={t('chipCierre', { periodo: t(`preset.${filtros.cierre}`) })} onQuitar={() => quitar('cierre')} />}
      {filtros.prioridades.length > 0 && <FilterChip etiqueta={t('chipPrioridad', { lista: filtros.prioridades.map((p) => tp(p)).join(', ') })} onQuitar={() => quitar('prioridad')} />}
      <button type="button" onClick={() => onFiltros({ ...filtrosVacios(), q: filtros.q, pipelineId: conPipeline ? '' : filtros.pipelineId })} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
        {t('limpiar')}
      </button>
    </div>
  );
}
