'use client';

import { TimelineFilters as FiltrosKit } from '@/components/crm/kit/TimelineFilters';
import { useCatalogosCrm } from '@/components/crm/acciones/useCatalogosCrm';
import { invalidarCatalogosCrm } from '@/components/crm/acciones/useCatalogosCrm';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { TimelineQuery } from '@/lib/services/crm/timelineService';
import { consultaDesdeFiltros, filtrosDesdeConsulta } from './filtrosTimelineLogica';

export interface TimelineFiltersProps {
  value: TimelineQuery;
  onChange: (v: TimelineQuery) => void;
  compact?: boolean;
}

/** Misma barra del kit para cliente y oportunidad; sin consultas desde el navegador. */
export function TimelineFilters({ value, onChange }: TimelineFiltersProps) {
  const { timezone } = useFormatDate();
  const { usuarios, cargando, error } = useCatalogosCrm();
  const t = useTranslations('crm.historial');
  return <div className="space-y-2"><FiltrosKit modo="entidad" mostrarBusqueda={false} valor={filtrosDesdeConsulta(value, timezone)}
    usuarios={usuarios} deshabilitado={cargando}
    onValorChange={filtros => onChange(consultaDesdeFiltros(filtros, timezone))} />
    {!!error && <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-danger-text">
      {t('catalogosError')}<Button size="sm" variant="ghost" onClick={invalidarCatalogosCrm}>{t('reintentar')}</Button>
    </div>}
  </div>;
}
