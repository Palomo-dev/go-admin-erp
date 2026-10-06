'use client';

/**
 * Filtros del listado de Llamadas (Figma 1351:18): búsqueda (número, cliente o
 * palabra dicha en la llamada), rango de días y panel de filtros con chips.
 * Todo del kit; los días son de la organización (`hoy` lo da `useFormatDate`).
 */

import { useTranslations } from 'next-intl';
import { SearchInput } from '@/components/kit/SearchInput';
import { DateRangeButton } from '@/components/kit/DateRangeButton';
import { FilterPanel } from '@/components/kit/FilterPanel';
import { FilterChips } from '@/components/kit/FilterChips';
import { FormField } from '@/components/kit/FormField';
import { ListToolbar } from '@/components/kit/ListToolbar';
import { Checkbox } from '@/components/ui/checkbox';
import { CLASE_CAMPO } from '@/components/crm/kit/camposCrm';
import { CALL_DIRECTIONS, CALL_MODES } from '@/lib/crm/enums';
import { DISPOSITION_OUTCOMES } from '@/lib/services/crm/callDispositionService';
import { EMPTY_FILTERS, filtrosActivosPanel, type CallsTableFilters, type ClavePanel } from './callsListadoLogica';

interface Props {
  filters: CallsTableFilters;
  onChange: (value: CallsTableFilters) => void;
  /** Hoy en la zona de la organización (YYYY-MM-DD). */
  hoy: string;
  /** Rango al que vuelve «Limpiar». */
  rangoPorDefecto: { fromDate: string; toDate: string };
  /** Sin `crm.calls.view_all` no tiene sentido «Solo las mías»: ya solo ves las tuyas. */
  puedeVerTodas: boolean;
}

export function CallsFilters({ filters, onChange, hoy, rangoPorDefecto, puedeVerTodas }: Props) {
  const t = useTranslations('crm.llamadas');
  const set = <K extends keyof CallsTableFilters>(k: K, v: CallsTableFilters[K]) => onChange({ ...filters, [k]: v });
  const activos = filtrosActivosPanel(filters).filter((k) => k !== 'mine' || puedeVerTodas);
  const limpiarPanel = () =>
    onChange({ ...filters, direction: '', outcome: '', mode: '', mine: false, hasRecording: false });

  const textoChip = (k: ClavePanel): string => {
    switch (k) {
      case 'direction':
        return t('chips.direccion', { valor: t(`direcciones.${filters.direction}`) });
      case 'outcome':
        return t('chips.resultado', { valor: t(`resultados.${filters.outcome}`) });
      case 'mode':
        return t('chips.modo', { valor: t(`modos.${filters.mode}`) });
      case 'mine':
        return t('soloMias');
      case 'hasRecording':
        return t('conGrabacion');
    }
  };

  const selects: { clave: 'direction' | 'outcome' | 'mode'; valores: readonly string[]; grupo: string }[] = [
    { clave: 'direction', valores: CALL_DIRECTIONS, grupo: 'direcciones' },
    { clave: 'outcome', valores: DISPOSITION_OUTCOMES, grupo: 'resultados' },
    { clave: 'mode', valores: CALL_MODES, grupo: 'modos' },
  ];

  return (
    <ListToolbar
      busqueda={
        <SearchInput
          value={filters.q}
          onChange={(v) => set('q', v)}
          placeholder={t('buscar')}
          etiqueta={t('buscarAria')}
          atajo={false}
          className="min-w-0 flex-1"
        />
      }
      filtros={
        <>
          <DateRangeButton
            valor={{ desde: filters.fromDate || rangoPorDefecto.fromDate, hasta: filters.toDate || rangoPorDefecto.toDate }}
            onValorChange={(r) => onChange({ ...filters, fromDate: r.desde, toDate: r.hasta })}
            hoy={hoy}
            etiqueta={t('rango')}
          />
          <FilterPanel conteo={activos.length} onLimpiar={limpiarPanel} titulo={t('filtros')}>
            <div className="grid gap-4">
              {selects.map(({ clave, valores, grupo }) => (
                <FormField key={clave} etiqueta={t(`campos.${clave}`)}>
                  <select className={CLASE_CAMPO} aria-label={t(`campos.${clave}`)} value={filters[clave]} onChange={(e) => set(clave, e.target.value)}>
                    <option value="">{t('todos')}</option>
                    {valores.map((v) => (
                      <option key={v} value={v}>
                        {t(`${grupo}.${v}`)}
                      </option>
                    ))}
                  </select>
                </FormField>
              ))}
              {puedeVerTodas && (
                <label className="flex min-h-10 items-center gap-2 text-sm text-fg">
                  <Checkbox checked={filters.mine} onCheckedChange={(v) => set('mine', v === true)} />
                  {t('soloMias')}
                </label>
              )}
              <label className="flex min-h-10 items-center gap-2 text-sm text-fg">
                <Checkbox checked={filters.hasRecording} onCheckedChange={(v) => set('hasRecording', v === true)} />
                {t('conGrabacion')}
              </label>
            </div>
          </FilterPanel>
        </>
      }
      chips={
        activos.length > 0 ? (
          <FilterChips
            chips={activos.map((k) => ({ clave: k, etiqueta: textoChip(k) }))}
            onQuitar={(k) => set(k as ClavePanel, (k === 'mine' || k === 'hasRecording' ? false : '') as never)}
            onLimpiarTodo={() => onChange({ ...EMPTY_FILTERS, q: filters.q, ...rangoPorDefecto })}
          />
        ) : undefined
      }
    />
  );
}
