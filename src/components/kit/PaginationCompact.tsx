'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Skeleton } from '@/components/ui/skeleton';
import { calcularRango, paginaDesdeTexto, resumenCompacto } from './paginacion';

/**
 * Paginación compacta (Figma `Pagination Layout=compact`): «‹ 1–10 de 273 ›»
 * a la izquierda e «Ir a [n]» a la derecha. Solo en móvil y en tablas
 * embebidas dentro de una tarjeta; en escritorio, siempre la completa.
 */
export interface PaginationCompactProps {
  pagina: number;
  tamano: number;
  total: number;
  onPaginaChange: (pagina: number) => void;
  cargando?: boolean;
  className?: string;
}

const BOTON =
  'flex size-10 items-center justify-center rounded-lg border border-line-strong bg-surface text-fg transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:pointer-events-none disabled:opacity-50';

export function PaginationCompact({ pagina, tamano, total, onPaginaChange, cargando, className }: PaginationCompactProps) {
  const r = calcularRango(pagina, tamano, total);
  const [ir, setIr] = React.useState(String(r.pagina));
  const idIr = React.useId();

  React.useEffect(() => setIr(String(r.pagina)), [r.pagina]);

  const confirmar = () => {
    const destino = paginaDesdeTexto(ir, r.totalPaginas);
    if (destino && destino !== r.pagina) onPaginaChange(destino);
    else setIr(String(r.pagina));
  };

  return (
    <nav aria-label="Paginación" className={cn('flex items-center justify-between gap-3', className)}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={BOTON}
          aria-label="Página anterior"
          disabled={cargando || r.pagina <= 1}
          onClick={() => onPaginaChange(r.pagina - 1)}
        >
          <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
        {cargando ? (
          <Skeleton className="h-4 w-20" />
        ) : (
          <span className="min-w-[5.5rem] text-center text-sm text-fg tabular-nums" aria-live="polite">
            {resumenCompacto(r)}
          </span>
        )}
        <button
          type="button"
          className={BOTON}
          aria-label="Página siguiente"
          disabled={cargando || r.pagina >= r.totalPaginas}
          onClick={() => onPaginaChange(r.pagina + 1)}
        >
          <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
      </div>
      {r.totalPaginas > 1 && (
        <div className="flex items-center gap-2">
          <label htmlFor={idIr} className="text-sm text-fg-secondary">
            Ir a
          </label>
          <input
            id={idIr}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={ir}
            disabled={cargando}
            aria-describedby={`${idIr}-total`}
            onChange={(e) => setIr(e.target.value.replace(/\D/g, ''))}
            onBlur={confirmar}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                confirmar();
              }
            }}
            className="h-10 w-14 rounded-lg border border-line-strong bg-surface text-center text-sm text-fg tabular-nums outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
          />
          <span id={`${idIr}-total`} className="sr-only">
            de {r.totalPaginas} páginas
          </span>
        </div>
      )}
    </nav>
  );
}
