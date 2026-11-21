'use client';

/**
 * Buscador, rango de fechas y filtros de Comisiones (Figma 1012:87993). El
 * estado va en las pestañas. Miembro = `organization_members` + `profiles`
 * (patrón canónico); un empleado solo ve las suyas y no ve ese filtro. Las
 * fechas son días calendario (YYYY-MM-DD) que el servidor acota en la zona
 * horaria de la organización.
 */

import { useTranslations } from 'next-intl';
import { CalendarDays } from 'lucide-react';
import { DateRangeButton, FilterPanel, FormField, ListToolbar, SearchInput, clasesBoton, inicioDeMes } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { OrgMemberOption } from '@/lib/hooks/useOrgMembers';
import type { ComisionesFiltersState } from './comisionesModel';

interface Props {
  filters: ComisionesFiltersState;
  onChange: (filters: ComisionesFiltersState) => void;
  members: OrgMemberOption[];
  /** Un empleado solo ve las suyas: se oculta el selector de miembro. */
  canManage: boolean;
}

const TODOS = '__todos__';
const ORIGENES: ReadonlyArray<ComisionesFiltersState['source_type']> = ['invoice_sale', 'opportunity', 'sale', 'invoice_purchase'];
const CAMPO = 'h-10 border-line-strong bg-surface';

export function ComisionesFilters({ filters, onChange, members, canManage }: Props) {
  const t = useTranslations('finanzasComisiones.filtros');
  const tOrigen = useTranslations('finanzasComisiones.origen');
  const { getToday } = useFormatDate();
  const set = (patch: Partial<ComisionesFiltersState>) => onChange({ ...filters, ...patch });
  const conteo = (filters.source_type !== 'all' ? 1 : 0) + (filters.payee_id ? 1 : 0);
  const hoy = getToday();

  return (
    <ListToolbar
      busqueda={<SearchInput value={filters.search} onChange={(v) => set({ search: v })} placeholder={t('buscar')} />}
      filtros={
        <div className="flex shrink-0 items-center gap-2">
          {filters.from && filters.to ? (
            <DateRangeButton
              valor={{ desde: filters.from, hasta: filters.to }}
              hoy={hoy}
              onValorChange={(r) => set({ from: r.desde, to: r.hasta })}
              onLimpiar={() => set({ from: '', to: '' })}
            />
          ) : (
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => set({ from: inicioDeMes(hoy), to: hoy })}>
              <CalendarDays className="size-4" aria-hidden="true" strokeWidth={1.5} />
              <span className="hidden sm:inline">{t('fechas')}</span>
            </button>
          )}
          <FilterPanel conteo={conteo} onLimpiar={() => set({ source_type: 'all', payee_id: '' })} titulo={t('titulo')}>
            <FormField etiqueta={t('origen')}>
              {(c) => (
                <Select value={filters.source_type} onValueChange={(v) => set({ source_type: v as ComisionesFiltersState['source_type'] })}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className={CAMPO}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('todos')}</SelectItem>
                    {ORIGENES.map((o) => (
                      <SelectItem key={o} value={o}>
                        {tOrigen(o)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            {canManage && (
              <FormField etiqueta={t('miembro')}>
                {(c) => (
                  <Select value={filters.payee_id || TODOS} onValueChange={(v) => set({ payee_id: v === TODOS ? '' : v })}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className={CAMPO}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS}>{t('todos')}</SelectItem>
                      {members.map((m) => (
                        <SelectItem key={m.user_id} value={m.user_id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            )}
          </FilterPanel>
        </div>
      }
    />
  );
}
