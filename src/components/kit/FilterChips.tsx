'use client';

import { cn } from '@/utils/Utils';
import { useKitT } from './useIdiomaKit';
import { FilterChip } from './FilterChip';

/**
 * Fila de filtros activos con «Limpiar todo» al final (PATRONES §3). En móvil
 * se desplaza en horizontal en lugar de ocupar varias líneas. Sin chips no se
 * dibuja nada.
 */
export interface ChipFiltro {
  clave: string;
  /** «Estado: Activos». */
  etiqueta: string;
}

export interface FilterChipsProps {
  chips: readonly ChipFiltro[];
  onQuitar: (clave: string) => void;
  onLimpiarTodo: () => void;
  /** Texto del enlace final; por defecto «Limpiar todo». */
  textoLimpiarTodo?: string;
  className?: string;
}

export function FilterChips({ chips, onQuitar, onLimpiarTodo, textoLimpiarTodo, className }: FilterChipsProps) {
  const t = useKitT();
  if (chips.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={t('filtros.activos')}
      className={cn(
        'flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0',
        className,
      )}
    >
      {chips.map((c) => (
        <FilterChip key={c.clave} etiqueta={c.etiqueta} onQuitar={() => onQuitar(c.clave)} />
      ))}
      <button
        type="button"
        onClick={onLimpiarTodo}
        className="h-7 shrink-0 rounded-md px-2 text-xs font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {textoLimpiarTodo ?? t('filtros.limpiarTodo')}
      </button>
    </div>
  );
}
