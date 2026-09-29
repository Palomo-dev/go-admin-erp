'use client';

/**
 * Búsqueda y filtros arriba, chips activos visibles (brief §3). Los chips
 * son botones con `aria-pressed` para que el lector de pantalla anuncie el
 * estado; el contador de resultados es `aria-live`.
 */

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';
import { EMPTY_FILTERS, OBJECTION_CATEGORIES, countActiveFilters, type ObjectionFilters } from '@/lib/services/crm/objectionModel';
import { CategoryIcon } from './categoryMeta';
import { SearchInput } from '@/components/kit/SearchInput';

interface Props {
  filters: ObjectionFilters;
  onChange: (next: ObjectionFilters) => void;
  total: number;
  shown: number;
  /** Categorías presentes en el catálogo (para no ofrecer chips vacíos). */
  categories: string[];
}

const STATUS: { value: ObjectionFilters['status']; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'active', label: 'Activas' },
  { value: 'inactive', label: 'Inactivas' },
];

function chipClass(active: boolean): string {
  return cn(
    'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium hover:transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950',
    active
      // blue-600 sobre blanco: 5,2:1 en ambos temas.
      ? 'border-blue-600 bg-blue-600 text-white'
      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800',
  );
}

export function ObjectionsToolbar({ filters, onChange, total, shown, categories }: Props) {
  const active = countActiveFilters(filters);
  const options = OBJECTION_CATEGORIES.filter((c) => categories.includes(c.value));
  // Categorías escritas a mano que no están en el catálogo fijo.
  const extra = categories.filter((c) => !OBJECTION_CATEGORIES.some((k) => k.value === c)).map((c) => ({ value: c, label: c }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          id="objections-search"
          value={filters.query}
          onChange={(v) => onChange({ ...filters, query: v })}
          onValueChange={(v) => onChange({ ...filters, query: v })}
          placeholder="Buscar por título, señal o respuesta…"
          etiqueta="Buscar objeciones"
          className="min-w-[220px] flex-1"
        />
        <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-1.5">
          {STATUS.map((s) => (
            <button key={s.value} type="button" aria-pressed={filters.status === s.value} className={chipClass(filters.status === s.value)} onClick={() => onChange({ ...filters, status: s.value })}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-gray-600 dark:text-gray-400">Categoría:</span>
        <div role="group" aria-label="Filtrar por categoría" className="flex flex-wrap gap-1.5">
          {[...options, ...extra].map((c) => {
            const on = filters.category === c.value;
            return (
              <button key={c.value} type="button" aria-pressed={on} className={chipClass(on)} onClick={() => onChange({ ...filters, category: on ? 'all' : c.value })}>
                <CategoryIcon value={c.value} />
                {c.label}
              </button>
            );
          })}
        </div>
        {active > 0 && (
          <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => onChange(EMPTY_FILTERS)}>
            <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Quitar filtros ({active})
          </Button>
        )}
        <span className="ml-auto text-xs text-gray-600 dark:text-gray-400" aria-live="polite">
          {shown === total ? `${total} ${total === 1 ? 'objeción' : 'objeciones'}` : `${shown} de ${total} objeciones`}
        </span>
      </div>
    </div>
  );
}
