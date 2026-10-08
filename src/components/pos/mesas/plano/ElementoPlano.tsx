'use client';

import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { EyeOff } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { ElementoEnPlano, TipoElemento } from './planoMesasLogica';

/**
 * Elemento fijo dibujado en el plano (Figma 2261:977952): columna, jardinera,
 * barra fija, pared, puerta, ventana o texto. En edición es un botón que se
 * arrastra (y se agranda desde la esquina cuando está elegido); fuera de
 * edición es decorativo. Si no se ve en el sitio, lleva el ojo tachado.
 */
const CLASES: Record<TipoElemento, string> = {
  column: 'rounded-md bg-solid-neutral text-on-solid',
  planter: 'rounded-t-full border border-line-success bg-success-subtle text-success-text',
  bar: 'rounded-md border border-line-strong bg-warning-subtle text-fg',
  wall: 'rounded-sm bg-fg-secondary text-on-solid',
  door: 'rounded-sm border-2 border-dashed border-fg-secondary bg-surface text-fg-secondary',
  window: 'rounded-sm border border-line-info bg-info-subtle text-info-text',
  label: 'rounded-md text-fg-secondary',
};

export interface ElementoPlanoProps {
  elemento: ElementoEnPlano;
  editando: boolean;
  seleccionado: boolean;
  /** Posición y tamaño ya calculados (sin girar) y el giro. */
  estilo: CSSProperties;
  /** «Columna · Elemento fijo» (lector de pantalla). */
  ariaLabel: string;
  etiquetaRedimensionar: string;
  onPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove?: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp?: (e: ReactPointerEvent<HTMLElement>) => void;
  onRedimensionarInicio?: (e: ReactPointerEvent<HTMLElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
}

export function ElementoPlano({
  elemento,
  editando,
  seleccionado,
  estilo,
  ariaLabel,
  etiquetaRedimensionar,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onRedimensionarInicio,
  onKeyDown,
}: ElementoPlanoProps) {
  const lado = Math.min(elemento.ancho, elemento.alto);
  const texto = elemento.etiqueta.trim();
  const contenido = (
    <>
      {texto && lado >= 16 && (
        <span className={cn('pointer-events-none truncate px-1 text-center font-medium leading-tight', elemento.tipo === 'label' ? 'text-[13px]' : 'text-[11px]')}>{texto}</span>
      )}
      {editando && !elemento.enSitio && (
        <EyeOff aria-hidden="true" className="pointer-events-none absolute right-0.5 top-0.5 size-3 opacity-70" strokeWidth={1.5} />
      )}
    </>
  );
  const base = cn('absolute flex items-center justify-center overflow-visible', CLASES[elemento.tipo]);

  if (!editando) {
    return (
      <div aria-hidden="true" className={cn(base, 'pointer-events-none select-none', !elemento.enSitio && 'opacity-80')} style={estilo}>
        {contenido}
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={seleccionado}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      className={cn(
        base,
        'cursor-grab touch-none active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        elemento.tipo === 'label' && 'border border-dashed border-line-strong',
        seleccionado && 'ring-2 ring-brand ring-offset-2 ring-offset-surface',
      )}
      style={estilo}
    >
      {contenido}
      {seleccionado && onRedimensionarInicio && (
        <span
          role="presentation"
          title={etiquetaRedimensionar}
          onPointerDown={(e) => {
            e.stopPropagation();
            onRedimensionarInicio(e);
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-sm border border-brand bg-surface"
        />
      )}
    </button>
  );
}
