'use client';
import { useAutomationText } from './useAutomationText';

/**
 * Búsqueda y filtros de la lista (brief §3: «búsqueda y filtros arriba, chips
 * de filtro activos visibles»). Los chips son botones con `aria-pressed`, así
 * que el lector de pantalla anuncia si están activos.
 */

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { X, SlidersHorizontal } from 'lucide-react';
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
  errorOnly?: boolean; onErrorOnlyChange?: (value: boolean) => void; errorFilterAvailable?: boolean;
}

const STATUS: { value: RuleFilters['status']; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'active', label: 'Activas' },
  { value: 'inactive', label: 'Pausadas' },
];

export function RulesToolbar({ filters, onChange, total, shown, errorOnly = false, onErrorOnlyChange, errorFilterAvailable = false }: Props) {
  const tr = useAutomationText();
  const active = countActiveFilters(filters);
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput id="rules-search" value={filters.query} onChange={query => onChange({ ...filters, query })} onValueChange={query => onChange({ ...filters, query })} placeholder={tr('Buscar por nombre o descripción…')} etiqueta={tr('Buscar reglas por nombre')} className="min-w-56 flex-1" />
      <ChipsOpcion etiqueta={tr('Filtrar por estado')} opciones={[...STATUS.map(s => ({ valor: s.value as string, etiqueta: tr(s.label) })), ...(onErrorOnlyChange ? [{ valor: 'errors', etiqueta: tr('Con error'), deshabilitada: !errorFilterAvailable, motivo: tr('Errores de los últimos 7 días') }] : [])]} valor={errorOnly ? 'errors' : filters.status} onValorChange={status => { if (status === 'errors') onErrorOnlyChange?.(true); else { onErrorOnlyChange?.(false); onChange({ ...filters, status: status as RuleFilters['status'] }); } }} />
      <Popover><PopoverTrigger asChild><Button patron="button" variante="secundario" icono={SlidersHorizontal} className="size-10 px-0" aria-label={tr('Filtrar por disparador')} /></PopoverTrigger><PopoverContent align="end" className="w-80 border-line bg-surface p-4"><p className="mb-3 text-xs font-medium text-fg-secondary">{tr('Disparador:')}</p><ChipsOpcion multiple etiqueta={tr('Filtrar por disparador')} opciones={TRIGGER_OPTIONS.map(t => ({ valor: t.value, etiqueta: tr(t.label) }))} valor={filters.triggers} onValorChange={triggers => onChange({ ...filters, triggers })} />
      {active > 0 && <Button patron="button" type="button" tamano="sm" variante="fantasma" icono={X} className="h-8 text-xs" onClick={() => onChange(EMPTY_FILTERS)}>{tr('Quitar filtros (')}{active})</Button>}
      <span className="sr-only" aria-live="polite">{shown === total ? tr('{p0} {p1}', { p0: total, p1: total === 1 ? 'regla' : 'reglas' }) : tr('{p0} de {p1} reglas', { p0: shown, p1: total })}</span>
      </PopoverContent></Popover>
    </div>
  </div>;
}
