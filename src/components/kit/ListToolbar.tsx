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
  /**
   * Filtros a la vista ANTES del buscador (Figma «05 POS y ventas» 3300-420726: «Fecha» y
   * «Medio de pago» fuera del panel). Opcional: sin él la fila es la de siempre.
   */
  antes?: ReactNode;
  filtros?: ReactNode;
  chips?: ReactNode;
  className?: string;
}

export function ListToolbar({ busqueda, antes, filtros, chips, className }: ListToolbarProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center gap-2 sm:gap-3">
        {antes}
        <div className="min-w-0 flex-1 [&>*]:w-full">{busqueda}</div>
        {filtros}
      </div>
      {chips}
    </div>
  );
}
