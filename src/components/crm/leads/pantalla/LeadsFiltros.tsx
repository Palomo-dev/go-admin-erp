'use client';

import { useLocale, useTranslations } from 'next-intl';
import { FilterPanel } from '@/components/kit/FilterPanel';
import { FilterChip } from '@/components/kit/FilterChip';
import { FormField } from '@/components/kit/FormField';
import { DateRangeButton } from '@/components/kit/DateRangeButton';
import { clasesBoton } from '@/components/kit/botonClases';
import { CLASE_CAMPO, type OpcionUsuario } from '@/components/crm/kit/camposCrm';
import { ORIGENES_LEAD, type OrigenLead } from '@/components/crm/kit/leadRowLogica';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { addPlainDays } from '@/lib/utils/dateDisplay';
import { etiquetaRango } from '@/components/kit/rangoFechas';
import { localeIntl } from '@/components/kit/idioma';
import { contarFiltrosLeads, filtrosLeadsVacios, type FiltrosLeads } from './leadsPantallaLogica';

/**
 * Filtros de Leads (Figma 765:446898 y chips 765:446935): origen, fecha de
 * captura (días de la organización), responsable y descartados. En escritorio
 * es un popover; en móvil, la hoja del `FilterPanel` del kit.
 */
export interface LeadsFiltrosProps {
  filtros: FiltrosLeads;
  onFiltros: (f: FiltrosLeads) => void;
  usuarios: readonly OpcionUsuario[];
}

export function LeadsFiltros({ filtros, onFiltros, usuarios }: LeadsFiltrosProps) {
  const t = useTranslations('crm.pantallaLeads.filtros');
  const to = useTranslations('crm.kit.leads.origen');
  const { getToday } = useFormatDate();
  const hoy = getToday();
  const cambiar = (p: Partial<FiltrosLeads>) => onFiltros({ ...filtros, ...p });
  return (
    <FilterPanel conteo={contarFiltrosLeads(filtros)} onLimpiar={() => onFiltros({ ...filtrosLeadsVacios(), q: filtros.q })} titulo={t('titulo')} etiquetaBoton={t('boton')}>
      <FormField etiqueta={t('origen')}>
        <select value={filtros.sinColocar ? 'web_form' : filtros.origen} onChange={(e) => cambiar({ origen: e.target.value as OrigenLead | '', sinColocar: false })} className={CLASE_CAMPO}>
          <option value="">{t('todos')}</option>
          {ORIGENES_LEAD.map((o) => (
            <option key={o} value={o}>{to(o)}</option>
          ))}
        </select>
      </FormField>
      <FormField etiqueta={t('responsable')}>
        <select value={filtros.responsable} onChange={(e) => cambiar({ responsable: e.target.value })} className={CLASE_CAMPO}>
          <option value="">{t('todos')}</option>
          <option value="ninguno">{t('sinAsignar')}</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>{u.nombre}</option>
          ))}
        </select>
      </FormField>
      <FormField etiqueta={t('captura')}>
        {filtros.rango ? (
          <DateRangeButton valor={filtros.rango} onValorChange={(rango) => cambiar({ rango })} hoy={hoy} etiqueta={t('captura')} onLimpiar={() => cambiar({ rango: null })} />
        ) : (
          <button type="button" onClick={() => cambiar({ rango: { desde: addPlainDays(hoy, -29), hasta: hoy } })} className={clasesBoton({ variante: 'secundario', className: 'w-full justify-start' })}>
            {t('cualquierFecha')}
          </button>
        )}
      </FormField>
      <label className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" checked={filtros.descartados} onChange={(e) => cambiar({ descartados: e.target.checked })} className="size-4 rounded border-line-strong accent-brand-action" />
        {t('descartados')}
      </label>
    </FilterPanel>
  );
}

/** Chips de los filtros activos + «Limpiar todo» (Figma 765:446935). */
export function LeadsFiltrosChips({ filtros, onFiltros, usuarios }: LeadsFiltrosProps) {
  const t = useTranslations('crm.pantallaLeads.filtros');
  const to = useTranslations('crm.kit.leads.origen');
  const idioma = useLocale();
  const cambiar = (p: Partial<FiltrosLeads>) => onFiltros({ ...filtros, ...p });
  const responsable = filtros.responsable === 'ninguno' ? t('sinAsignar') : usuarios.find((u) => u.id === filtros.responsable)?.nombre ?? '—';
  return (
    <div className="flex flex-wrap items-center gap-2">
      {filtros.sinColocar && <FilterChip etiqueta={t('chipSinColocar')} onQuitar={() => cambiar({ sinColocar: false })} />}
      {filtros.origen && !filtros.sinColocar && <FilterChip etiqueta={t('chipOrigen', { origen: to(filtros.origen) })} onQuitar={() => cambiar({ origen: '' })} />}
      {filtros.rango && <FilterChip etiqueta={t('chipCaptura', { rango: etiquetaRango(filtros.rango, localeIntl(idioma)) })} onQuitar={() => cambiar({ rango: null })} />}
      {filtros.responsable && <FilterChip etiqueta={t('chipResponsable', { nombre: responsable })} onQuitar={() => cambiar({ responsable: '' })} />}
      {filtros.descartados && <FilterChip etiqueta={t('chipDescartados')} onQuitar={() => cambiar({ descartados: false })} />}
      <button type="button" onClick={() => onFiltros(filtrosLeadsVacios())} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
        {t('limpiarTodo')}
      </button>
    </div>
  );
}
