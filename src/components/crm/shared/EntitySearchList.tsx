'use client';

/**
 * Buscador + lista de resultados como botones `aria-pressed` (F12; mismo
 * patrón que la prueba en seco de Automatizaciones). Operable solo con
 * teclado: Tab al campo, Tab a cada resultado, Enter/Espacio elige. Sin
 * `div onClick`. La búsqueda la hace el llamador (hook con RLS); aquí solo
 * se pinta.
 */

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/utils/Utils';

export interface SearchHit {
  id: string;
  title: string;
  subtitle?: string | null;
}

interface Props {
  id: string;
  label: string;
  placeholder: string;
  query: string;
  onQueryChange: (q: string) => void;
  hits: SearchHit[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (hit: SearchHit) => void;
  /** Texto bajo el campo: qué está elegido o qué falta. */
  hint: string;
  fieldError?: string;
  emptyText?: string;
}

export function hitButtonClass(active: boolean): string {
  return cn(
    'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950',
    active
      ? 'border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-950/60 dark:text-blue-100'
      : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800',
  );
}

export function EntitySearchList({ id, label, placeholder, query, onQueryChange, hits, loading, error, selectedId, onSelect, hint, fieldError, emptyText = 'Nada coincide con la búsqueda.' }: Props) {
  const describedBy = fieldError ? `${id}-error` : `${id}-hint`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs text-gray-700 dark:text-gray-300">{label}</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
        <Input
          id={id}
          type="search"
          autoComplete="off"
          className="pl-9"
          placeholder={placeholder}
          value={query}
          aria-invalid={!!fieldError}
          aria-describedby={describedBy}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </div>
      {fieldError ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-red-700 dark:text-red-300">{fieldError}</p>
      ) : (
        <p id={`${id}-hint`} className="text-xs text-gray-600 dark:text-gray-400">{hint}</p>
      )}
      {error && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{error}</p>}
      <ul aria-label={`Resultados: ${label}`} aria-busy={loading} className="max-h-56 space-y-1 overflow-y-auto">
        {hits.map((h) => (
          <li key={h.id}>
            <button type="button" aria-pressed={selectedId === h.id} className={hitButtonClass(selectedId === h.id)} onClick={() => onSelect(h)}>
              <span className="truncate font-medium">{h.title}</span>
              {h.subtitle && <span className="truncate text-xs text-gray-600 dark:text-gray-400">{h.subtitle}</span>}
            </button>
          </li>
        ))}
        {!loading && hits.length === 0 && !error && (
          <li className="px-1 text-xs text-gray-600 dark:text-gray-400">{emptyText}</li>
        )}
      </ul>
    </div>
  );
}
