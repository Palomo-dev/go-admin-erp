'use client';
import { useAutomationText } from './useAutomationText';

/**
 * Búsqueda y filtros de la lista (brief §3: «búsqueda y filtros arriba, chips
 * de filtro activos visibles»). Los chips son botones con `aria-pressed`, así
 * que el lector de pantalla anuncia si están activos.
 */

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';
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

function chipClass(active: boolean): string {
  return cn(
    'inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950',
    active
      // blue-600 en ambos temas: blue-500/blanco da 3,7:1 y no pasa AA.
      ? 'border-brand bg-brand text-white'
      : 'border-line-strong bg-surface text-fg-secondary hover:bg-subtle dark:border-line-strong dark:bg-surface dark:text-fg-secondary dark:hover:bg-hover',
  );
}

export function RulesToolbar({ filters, onChange, total, shown }: Props) {
  const tr = useAutomationText();
  const active = countActiveFilters(filters);
  const toggleTrigger = (value: string) => {
    const triggers = filters.triggers.includes(value)
      ? filters.triggers.filter((t) => t !== value)
      : [...filters.triggers, value];
    onChange({ ...filters, triggers });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          id="rules-search"
          value={filters.query}
          onChange={(v) => onChange({ ...filters, query: v })}
          onValueChange={(v) => onChange({ ...filters, query: v })}
          placeholder={tr("Buscar por nombre o descripción…")}
          etiqueta={tr("Buscar reglas por nombre")}
          className="min-w-[220px] flex-1"
        />
        <div role="group" aria-label={tr("Filtrar por estado")} className="flex gap-1">
          {STATUS.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={filters.status === s.value}
              className={chipClass(filters.status === s.value)}
              onClick={() => onChange({ ...filters, status: s.value })}
            >
              {tr(s.label)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-fg-secondary dark:text-fg-secondary">{tr("Disparador:")}</span>
        <div role="group" aria-label={tr("Filtrar por disparador")} className="flex flex-wrap gap-1.5">
          {TRIGGER_OPTIONS.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={filters.triggers.includes(t.value)}
              className={chipClass(filters.triggers.includes(t.value))}
              onClick={() => toggleTrigger(t.value)}
            >
              {tr(t.label)}
            </button>
          ))}
        </div>
        {active > 0 && (
          <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => onChange(EMPTY_FILTERS)}>
            <X strokeWidth={1.5} className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            {tr("Quitar filtros (")}{active})
          </Button>
        )}
        <span className="ml-auto text-xs text-fg-secondary dark:text-fg-secondary" aria-live="polite">
          {shown === total ? tr("{p0} {p1}", { p0: total, p1: total === 1 ? 'regla' : 'reglas' }) : tr("{p0} de {p1} reglas", { p0: shown, p1: total })}
        </span>
      </div>
    </div>
  );
}
