'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarDays, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { SearchInput } from '@/components/kit/SearchInput';
import { DateRangeButton } from '@/components/kit/DateRangeButton';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { addPlainDays } from '@/lib/utils/dateDisplay';
import type { OpcionUsuario } from './camposCrm';
import { SelectCrm } from './SelectCrm';
import { contarFiltrosPanel, filtrosVacios, hayFiltros, TIPOS_TIMELINE, type FiltrosTimeline, type TipoTimeline } from './timelineFiltersLogica';

/**
 * Filtros de la línea de tiempo única (Figma `TimelineFilters` 759:444935):
 * chips de tipo (Todos, Llamadas, Correos, WhatsApp, Reuniones, Notas,
 * Tareas, Sistema, Llamada IA), búsqueda, responsable, cliente u oportunidad
 * y rango de fechas en la zona de la organización.
 *
 * - Escritorio (`lg:`): todo a la vista y «Limpiar».
 * - Móvil: búsqueda, «Filtros (n)» —abre el `FilterPanel` de la pantalla con
 *   responsable, fechas y entidad— y los chips con desplazamiento horizontal.
 *
 * `modo='entidad'` (ficha del cliente u oportunidad) oculta el filtro de
 * entidad, que ya está fijado.
 */
export interface TimelineFiltersProps {
  valor: FiltrosTimeline;
  onValorChange: (valor: FiltrosTimeline) => void;
  usuarios?: readonly OpcionUsuario[];
  modo?: 'organizacion' | 'entidad';
  /** Selector de cliente u oportunidad (el `CustomerLinkPicker` o el de oportunidades de la pantalla). */
  selectorEntidad?: ReactNode;
  onAbrirPanel?: () => void;
  deshabilitado?: boolean;
  className?: string;
  mostrarBusqueda?: boolean;
}

export function TimelineFilters({ valor, onValorChange, usuarios = [], modo = 'organizacion', selectorEntidad, onAbrirPanel, deshabilitado, className, mostrarBusqueda = true }: TimelineFiltersProps) {
  const t = useTranslations('crm.kit.filtrosLinea');
  const { getToday } = useFormatDate();
  const hoy = getToday();
  const cambiar = (parcial: Partial<FiltrosTimeline>) => onValorChange({ ...valor, ...parcial });
  const enPanel = contarFiltrosPanel(valor);
  const ficha = modo === 'entidad' && !mostrarBusqueda;

  const chips = (
    <div role="group" aria-label={t('tipos')} className={cn('-mx-1 flex gap-1.5 px-1 pb-1 lg:flex-wrap lg:overflow-visible', ficha ? 'flex-wrap' : 'overflow-x-auto')}>
      {TIPOS_TIMELINE.map((tipo: TipoTimeline) => {
        const activo = valor.tipo === tipo;
        return (
          <button
            key={tipo}
            type="button"
            aria-pressed={activo}
            disabled={deshabilitado}
            onClick={() => cambiar({ tipo })}
            className={cn(
              'h-8 shrink-0 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50',
              activo ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line-strong bg-surface text-fg-secondary hover:bg-hover',
            )}
          >
            {t(`tipo.${tipo}`)}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {ficha && chips}
      <div className="flex flex-wrap items-center gap-2">
        {mostrarBusqueda && <SearchInput
          value={valor.texto}
          onChange={(texto) => cambiar({ texto })}
          placeholder={t('buscar')}
          etiqueta={t('buscar')}
          className="min-w-0 flex-1 lg:max-w-[320px]"
        />}
        {!ficha && <button
          type="button"
          onClick={onAbrirPanel}
          disabled={deshabilitado}
          className={clasesBoton({ variante: 'secundario', className: 'lg:hidden' })}
          aria-label={enPanel ? t('filtrosConCuenta', { n: enPanel }) : t('filtros')}
        >
          <SlidersHorizontal aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('filtros')}
          {enPanel > 0 && <span className="rounded-full bg-brand-action px-1.5 text-xs text-fg-on-brand">{enPanel}</span>}
        </button>}
        <div className={cn('min-w-0 flex-1 flex-wrap items-center gap-2', ficha ? 'flex' : 'hidden lg:flex')}>
          <SelectCrm
            aria-label={t('responsable')}
            valor={valor.responsableId}
            disabled={deshabilitado}
            onValorChange={(responsableId) => cambiar({ responsableId })}
            opcionVacia={t('todosResponsables')}
            opciones={usuarios.map((u) => ({ valor: u.id, etiqueta: u.nombre }))}
            className="w-auto max-w-[220px] gap-2"
          />
          {modo === 'organizacion' && selectorEntidad}
          {valor.rango ? (
            <DateRangeButton
              valor={valor.rango}
              onValorChange={(rango) => cambiar({ rango })}
              hoy={hoy}
              etiqueta={t('rango')}
              onLimpiar={() => cambiar({ rango: null })}
              deshabilitado={deshabilitado}
            />
          ) : (
            // Sin rango no se filtra por fecha: el botón propone los últimos 30 días.
            <button
              type="button"
              disabled={deshabilitado}
              onClick={() => cambiar({ rango: { desde: addPlainDays(hoy, -29), hasta: hoy } })}
              className={clasesBoton({ variante: 'secundario' })}
            >
              <CalendarDays aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('todasLasFechas')}
            </button>
          )}
          {hayFiltros(valor) && (
            <button type="button" onClick={() => onValorChange(filtrosVacios())} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
              <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('limpiar')}
            </button>
          )}
        </div>
      </div>
      {!ficha && chips}
    </div>
  );
}
