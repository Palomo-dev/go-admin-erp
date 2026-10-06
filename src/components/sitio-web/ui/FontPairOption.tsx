'use client';

import { CircleCheck } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { useTextosComun } from './textos';

/**
 * Par tipográfico del sitio (Figma A/07d): caja «Aa» en la fuente de títulos,
 * «Cormorant + Inter» y «Elegante · títulos con serifa». Seleccionado: borde
 * de marca, tinte y check. La fuente del CLIENTE solo pinta la muestra «Aa»
 * (dato del borrador V2); el resto del control usa Inter del ERP.
 *
 * Es un `radio`: quien lo usa pone el `role="radiogroup"` con su etiqueta.
 */
export interface FontPairOptionProps {
  /** Familia de títulos («Cormorant»). */
  titulos: string;
  /** Familia de texto («Inter»). */
  texto: string;
  /** «Elegante · títulos con serifa». */
  descripcion?: string;
  /** `font-family` CSS de la muestra; por defecto `'<titulos>', serif`. */
  familiaMuestra?: string;
  seleccionado: boolean;
  onSeleccionar: () => void;
  deshabilitado?: boolean;
  className?: string;
}

export function FontPairOption({
  titulos,
  texto,
  descripcion,
  familiaMuestra,
  seleccionado,
  onSeleccionar,
  deshabilitado,
  className,
}: FontPairOptionProps) {
  const tx = useTextosComun();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={seleccionado}
      disabled={deshabilitado}
      onClick={onSeleccionar}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50',
        seleccionado ? 'border-brand bg-brand-tint ring-1 ring-brand' : 'border-line bg-surface hover:bg-hover',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-12 shrink-0 items-center justify-center rounded-lg text-2xl text-fg',
          seleccionado ? 'bg-surface' : 'bg-subtle',
        )}
        style={{ fontFamily: familiaMuestra ?? `'${titulos}', serif` }}
      >
        Aa
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium leading-5 text-fg">
          {titulos} + {texto}
        </span>
        {descripcion ? <span className="truncate text-[13px] leading-[18px] text-fg-secondary">{descripcion}</span> : null}
      </span>
      {seleccionado && (
        <>
          <CircleCheck aria-hidden="true" className="size-5 shrink-0 text-brand" strokeWidth={1.5} />
          <span className="sr-only">{tx('fuentes.seleccionado')}</span>
        </>
      )}
    </button>
  );
}
