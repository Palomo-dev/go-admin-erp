'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/utils/Utils';

/**
 * Opción de fuente (Figma «figma-estilo» 07): «Aa» en la fuente del cliente,
 * nombre y, si aplica, su papel («Títulos del sitio»). Seleccionada: tinte de
 * marca, nombre en azul profundo y check. La fuente del cliente solo pinta la
 * muestra «Aa»; el nombre va en Inter del ERP.
 *
 * Es un `option` de un `listbox` (lo pone `FontField`); también sirve suelta
 * con `role="radio"` dentro de un `radiogroup`.
 */
export interface FontOptionProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  familia: string;
  /** «Títulos del sitio», «Texto del sitio». */
  descripcion?: string;
  seleccionada: boolean;
  /** `font-family` CSS de la muestra; por defecto `'<familia>', sans-serif`. */
  familiaMuestra?: string;
  /** Resaltada por teclado dentro del listbox. */
  activa?: boolean;
  rol?: 'option' | 'radio';
}

export const FontOption = forwardRef<HTMLButtonElement, FontOptionProps>(function FontOption(
  { familia, descripcion, seleccionada, familiaMuestra, activa, rol = 'option', className, ...resto },
  ref,
) {
  const aria = rol === 'option' ? { 'aria-selected': seleccionada } : { 'aria-checked': seleccionada };
  return (
    <button
      ref={ref}
      type="button"
      role={rol}
      {...aria}
      {...resto}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50',
        seleccionada ? 'bg-brand-tint' : 'hover:bg-hover',
        activa && !seleccionada && 'bg-hover',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="w-7 shrink-0 text-lg leading-none text-fg"
        style={{ fontFamily: familiaMuestra ?? `'${familia}', sans-serif` }}
      >
        Aa
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('truncate text-sm leading-5', seleccionada ? 'text-brand-deep' : 'text-fg')}>{familia}</span>
        {descripcion ? <span className="truncate text-xs leading-4 text-fg-muted">{descripcion}</span> : null}
      </span>
      {seleccionada && <Check aria-hidden="true" className="size-4 shrink-0 text-brand-deep" strokeWidth={1.5} />}
    </button>
  );
});
