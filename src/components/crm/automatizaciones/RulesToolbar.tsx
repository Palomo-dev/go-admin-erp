'use client';

/**
 * Búsqueda y filtros de la lista (brief §3: «búsqueda y filtros arriba, chips
 * de filtro activos visibles»). Los chips son botones con `aria-pressed`, así
 * que el lector de pantalla anuncia si están activos.
 */

import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';
import { TRIGGER_OPTIONS } from '@/lib/services/crm/automation/ruleCatalog';
import { countActiveFilters, EMPTY_FILTERS, type RuleFilters } from '@/lib/services/crm/automation/ruleEditorModel';

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
      ? 'border-blue-600 bg-blue-600 text-white'
      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800',
  );
}

export function RulesToolbar({ filters, onChange, total, shown }: Props) {
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
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" aria-hidden="true" />
          <label htmlFor="rules-search" className="sr-only">Buscar reglas por nombre</label>
          <Input
            id="rules-search"
            type="search"
            placeholder="Buscar por nombre o descripción…"
            className="pl-9"
            value={filters.query}
            onChange={(e) => onChange({ ...filters, query: e.target.value })}
          />
        </div>
        <div role="group" aria-label="Filtrar por estado" className="flex gap-1">
          {STATUS.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={filters.status === s.value}
              className={chipClass(filters.status === s.value)}
              onClick={() => onChange({ ...filters, status: s.value })}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-gray-600 dark:text-gray-400">Disparador:</span>
        <div role="group" aria-label="Filtrar por disparador" className="flex flex-wrap gap-1.5">
          {TRIGGER_OPTIONS.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={filters.triggers.includes(t.value)}
              className={chipClass(filters.triggers.includes(t.value))}
              onClick={() => toggleTrigger(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {active > 0 && (
          <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => onChange(EMPTY_FILTERS)}>
            <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Quitar filtros ({active})
          </Button>
        )}
        <span className="ml-auto text-xs text-gray-600 dark:text-gray-400" aria-live="polite">
          {shown === total ? `${total} ${total === 1 ? 'regla' : 'reglas'}` : `${shown} de ${total} reglas`}
        </span>
      </div>
    </div>
  );
}
