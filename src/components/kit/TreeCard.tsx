'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { ListCard, type ListCardProps } from './ListCard';

/**
 * Tarjeta de árbol para móvil (Figma: «Móvil / Categorías — listo», frames
 * «Sangría nivel 0/1/2»): la `ListCard` de siempre, desplazada 16 px por
 * nivel, con el chevron de la rama a la izquierda. Las hojas dejan el hueco
 * del chevron para que las tarjetas del mismo nivel queden alineadas.
 */
export interface TreeCardProps extends ListCardProps {
  nivel: number;
  tieneHijos: boolean;
  abierto?: boolean;
  onAlternar?: () => void;
}

export function TreeCard({ nivel, tieneHijos, abierto, onAlternar, ...card }: TreeCardProps) {
  return (
    <div className="flex items-center gap-1" style={{ paddingLeft: nivel * 16 }}>
      {tieneHijos ? (
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={!!abierto}
          aria-label={abierto ? `Contraer ${card.titulo}` : `Expandir ${card.titulo}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {abierto ? (
            <ChevronDown aria-hidden="true" className="size-4" strokeWidth={1.5} />
          ) : (
            <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
          )}
        </button>
      ) : (
        <span aria-hidden="true" className="size-8 shrink-0" />
      )}
      <ListCard {...card} className="min-w-0 flex-1" />
    </div>
  );
}
