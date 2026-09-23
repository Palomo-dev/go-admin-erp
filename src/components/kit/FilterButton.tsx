'use client';

import * as React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { useFormatoEntero, useKitT } from './useIdiomaKit';

/**
 * Botón «Filtros» con contador (Figma `FilterButton`, PATRONES §3):
 * `default` sin filtros, `active` con contador, `open` mientras el panel está
 * desplegado. Siempre a la derecha del buscador y con el mismo alto (40 px).
 */
export interface FilterButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  conteo?: number;
  abierto?: boolean;
  etiqueta?: string;
}

export const FilterButton = React.forwardRef<HTMLButtonElement, FilterButtonProps>(function FilterButton(
  { conteo = 0, abierto = false, etiqueta: etiquetaProp, className, ...props },
  ref,
) {
  const t = useKitT();
  const entero = useFormatoEntero();
  const etiqueta = etiquetaProp ?? t('filtros.boton');
  const activo = conteo > 0;
  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={abierto}
      aria-haspopup="dialog"
      aria-label={activo ? t('filtros.botonActivos', { etiqueta, count: conteo, n: entero(conteo) }) : etiqueta}
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors sm:px-4',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1',
        activo || abierto
          ? 'border-brand bg-brand-tint text-brand-deep hover:bg-brand-tint-hover'
          : 'border-line-strong bg-surface text-fg hover:bg-hover',
        abierto && 'ring-2 ring-brand/20',
        className,
      )}
      {...props}
    >
      <SlidersHorizontal aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
      <span>{etiqueta}</span>
      {activo && (
        <span
          aria-hidden="true"
          className="flex h-5 min-w-5 items-center justify-center rounded-full bg-solid-brand px-1 text-[11px] font-semibold leading-none text-on-solid tabular-nums"
        >
          {conteo}
        </span>
      )}
    </button>
  );
});
