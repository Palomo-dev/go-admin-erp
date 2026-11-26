import type { ReactNode } from 'react';
import { cn } from '@/utils/Utils';

/**
 * Fila buscador + «Filtros» con los chips debajo (PATRONES §3 y §4.1). Lleva
 * **solo** eso: nada de acciones de cabecera repetidas aquí. El buscador
 * ocupa el ancho sobrante y el botón de filtros se ajusta a su contenido.
 *
 * ```tsx
 * <ListToolbar
 *   busqueda={<SearchInput value={l.busqueda} onChange={l.setBusqueda} placeholder="Buscar proveedor o NIT" />}
 *   filtros={<FilterPanel conteo={l.filtrosActivos} onLimpiar={l.limpiarFiltros}>…</FilterPanel>}
 *   chips={<FilterChips chips={chips} onQuitar={(c) => l.setFiltro(c, null)} onLimpiarTodo={l.limpiarFiltros} />}
 * />
 * ```
 */
export interface ListToolbarProps {
  busqueda: ReactNode;
  filtros?: ReactNode;
  chips?: ReactNode;
  className?: string;
}

export function ListToolbar({ busqueda, filtros, chips, className }: ListToolbarProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="min-w-0 flex-1 [&>*]:w-full">{busqueda}</div>
        {filtros}
      </div>
      {chips}
    </div>
  );
}
