'use client';
import { useAutomationText } from './useAutomationText';

/**
 * Búsqueda y filtros de la lista (brief §3: «búsqueda y filtros arriba, chips
 * de filtro activos visibles»). Los chips son botones con `aria-pressed`, así
 * que el lector de pantalla anuncia si están activos.
 */

import { X } from 'lucide-react';
import { KbdButton as Button } from '@/components/kit/KbdButton';
import { ChipsOpcion } from '@/components/kit/ChipsOpcion';
import { TRIGGER_OPTIONS } from '@/lib/services/crm/automation/ruleCatalog';
import { countActiveFilters, EMPTY_FILTERS, type RuleFilters } from '@/lib/services/crm/automation/ruleEditorModel';
import { SearchInput } from '@/components/kit/SearchInput';

interface Props {
  filters: RuleFilters;
  onChange: (next: RuleFilters) => void;
  total: number;
  shown: number;
}

const STATUS: { value: RuleFilters['status']; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'active', label: 'Activas' },
  { value: 'inactive', label: 'Inactivas' },
];

export function RulesToolbar({ filters, onChange, total, shown }: Props) {
  const tr = useAutomationText();
  const active = countActiveFilters(filters);
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput id="rules-search" value={filters.query} onChange={query => onChange({ ...filters, query })} onValueChange={query => onChange({ ...filters, query })} placeholder={tr('Buscar por nombre o descripción…')} etiqueta={tr('Buscar reglas por nombre')} className="min-w-56 flex-1" />
      <ChipsOpcion etiqueta={tr('Filtrar por estado')} opciones={STATUS.map(s => ({ valor: s.value, etiqueta: tr(s.label) }))} valor={filters.status} onValorChange={status => onChange({ ...filters, status })} />
    </div>
    <div className="flex flex-wrap items-start gap-2">
      <details className="text-[13px] text-fg-secondary" open={filters.triggers.length ? true : undefined}>
        <summary className="w-fit cursor-pointer rounded-md px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">{tr('Disparador:')}</summary>
        <ChipsOpcion multiple etiqueta={tr('Filtrar por disparador')} className="mt-2" opciones={TRIGGER_OPTIONS.map(t => ({ valor: t.value, etiqueta: tr(t.label) }))} valor={filters.triggers} onValorChange={triggers => onChange({ ...filters, triggers })} />
      </details>
      {active > 0 && <Button patron="button" type="button" tamano="sm" variante="fantasma" className="h-8 text-xs" onClick={() => onChange(EMPTY_FILTERS)}><X strokeWidth={1.5} className="mr-1 size-3.5" aria-hidden />{tr('Quitar filtros (')}{active})</Button>}
      <span className="ml-auto text-xs text-fg-secondary" aria-live="polite">{shown === total ? tr('{p0} {p1}', { p0: total, p1: total === 1 ? 'regla' : 'reglas' }) : tr('{p0} de {p1} reglas', { p0: shown, p1: total })}</span>
    </div>
  </div>;
}
