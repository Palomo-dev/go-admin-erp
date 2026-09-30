'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { SlidersHorizontal } from 'lucide-react';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { FormField } from '@/components/kit/FormField';
import { DateRangeButton } from '@/components/kit/DateRangeButton';
import { clasesBoton } from '@/components/kit/botonClases';
import type { OpcionUsuario } from '@/components/crm/kit/camposCrm';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import type { FiltrosTimeline } from '@/components/crm/kit/timelineFiltersLogica';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { addPlainDays } from '@/lib/utils/dateDisplay';

/**
 * Filtros de Actividades en móvil (Figma 770:17115): responsable, cliente u
 * oportunidad y rango (días de la organización). En escritorio viven en
 * `TimelineFilters`; en móvil ese componente solo pinta «Filtros (n)».
 */
export interface FiltrosMovilActividadesProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  filtros: FiltrosTimeline;
  onFiltros: (f: FiltrosTimeline) => void;
  usuarios: readonly OpcionUsuario[];
  selectorEntidad: ReactNode;
  onLimpiar: () => void;
}

export function FiltrosMovilActividades({ abierto, onAbiertoChange, filtros, onFiltros, usuarios, selectorEntidad, onLimpiar }: FiltrosMovilActividadesProps) {
  const t = useTranslations('crm.pantallaActividades.filtrosMovil');
  const { getToday } = useFormatDate();
  const hoy = getToday();
  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      icono={SlidersHorizontal}
      ancho={520}
      pie={
        <>
          <button type="button" onClick={onLimpiar} className={clasesBoton({ variante: 'secundario' })}>{t('limpiar')}</button>
          <button type="button" onClick={() => onAbiertoChange(false)} className={clasesBoton()}>{t('ver')}</button>
        </>
      }
    >
      <FormField etiqueta={t('responsable')}>
        <SelectCrm
          valor={filtros.responsableId}
          onValorChange={(responsableId) => onFiltros({ ...filtros, responsableId })}
          opcionVacia={t('todos')}
          opciones={usuarios.map((u) => ({ valor: u.id, etiqueta: u.nombre }))}
        />
      </FormField>
      <FormField etiqueta={t('entidad')}>
        <div>{selectorEntidad}</div>
      </FormField>
      <FormField etiqueta={t('rango')}>
        {filtros.rango ? (
          <DateRangeButton valor={filtros.rango} onValorChange={(rango) => onFiltros({ ...filtros, rango })} hoy={hoy} etiqueta={t('rango')} onLimpiar={() => onFiltros({ ...filtros, rango: null })} />
        ) : (
          <button type="button" onClick={() => onFiltros({ ...filtros, rango: { desde: addPlainDays(hoy, -29), hasta: hoy } })} className={clasesBoton({ variante: 'secundario', className: 'w-full justify-start' })}>
            {t('todasLasFechas')}
          </button>
        )}
      </FormField>
    </PanelAdaptable>
  );
}
