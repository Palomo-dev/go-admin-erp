'use client';

import { useTranslations } from 'next-intl';
import { FilterPanel } from '@/components/kit/FilterPanel';
import { FilterChip } from '@/components/kit/FilterChip';
import { FormField } from '@/components/kit/FormField';
import { clasesBoton } from '@/components/kit/botonClases';
import { cn } from '@/utils/Utils';
import { CLASE_CAMPO, type OpcionUsuario } from '@/components/crm/kit/camposCrm';
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
          <select value={filtros.pipelineId} onChange={(e) => cambiar({ pipelineId: e.target.value, etapaId: '' })} className={CLASE_CAMPO}>
            <option value="">{t('todos')}</option>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </FormField>
      )}
      {etapas && (
        <FormField etiqueta={t('etapa')}>
          <select value={filtros.etapaId} onChange={(e) => cambiar({ etapaId: e.target.value })} className={CLASE_CAMPO}>
            <option value="">{t('todas')}</option>
            {etapasVisibles.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </FormField>
      )}
      <FormField etiqueta={t('responsable')}>
        <select value={filtros.responsable} onChange={(e) => cambiar({ responsable: e.target.value })} className={CLASE_CAMPO}>
          <option value="">{t('todos')}</option>
          <option value="yo">{t('yo')}</option>
          <option value="ninguno">{t('sinAsignar')}</option>
          {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
      </FormField>
      <FormField etiqueta={t('cierre')}>
        <select value={filtros.cierre} onChange={(e) => cambiar({ cierre: e.target.value as PresetCierre })} className={CLASE_CAMPO}>
          <option value="">{t('cualquierFecha')}</option>
          {PRESETS_CIERRE.map((p) => <option key={p} value={p}>{t(`preset.${p}`)}</option>)}
        </select>
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
