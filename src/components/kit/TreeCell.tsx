'use client';

import type { CSSProperties, ReactNode } from 'react';
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { PropsNodoArrastre } from './arrastreArbol';
import { useKitT } from './useIdiomaKit';

/**
 * Celda de árbol (Figma `TreeCell` 580:278007: Nivel 0/1/2 × Rama
 * abierta/cerrada/hoja). Sangría real de 24 px por nivel, chevron que abre o
 * cierra la rama (hueco del mismo ancho en las hojas para que los iconos
 * queden alineados), icono en caja tintada de 32 px, título y, debajo, el
 * texto secundario (el slug en categorías).
 *
 * Va dentro de una fila de `DataTable` (la fila abre el detalle): el chevron
 * detiene el clic para no navegar. Con `arrastre` la celda se puede arrastrar
 * sobre otra para cambiar de padre (ver `useArrastreArbol`).
 */
export interface TreeCellProps {
  titulo: string;
  /** Segunda línea en gris (slug, código). */
  subtitulo?: ReactNode;
  nivel: number;
  tieneHijos: boolean;
  abierto?: boolean;
  onAlternar?: () => void;
  icono?: LucideIcon;
  /** Color propio del registro (dato de la BD): tiñe la caja del icono. Sin él, el tinte de marca. */
  color?: string | null;
  /** URL de una imagen propia: sustituye al icono. */
  miniatura?: string | null;
  /** Badge o marca junto al título. */
  extra?: ReactNode;
  /** Ancestro que se ve solo como contexto de una coincidencia de búsqueda. */
  contexto?: boolean;
  arrastre?: PropsNodoArrastre;
  /** Sangría por nivel en px (24 en tabla, 16 en listas estrechas). */
  sangria?: number;
  className?: string;
}

export function TreeCell({
  titulo,
  subtitulo,
  nivel,
  tieneHijos,
  abierto,
  onAlternar,
  icono: Icono,
  color,
  miniatura,
  extra,
  contexto,
  arrastre,
  sangria = 24,
  className,
}: TreeCellProps) {
  const t = useKitT();
  const cajaTinte: CSSProperties | undefined = color
    ? { backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, color }
    : undefined;

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-lg',
        arrastre?.esDestino && 'bg-brand-tint ring-2 ring-inset ring-line-brand',
        arrastre?.esOrigen && 'opacity-50',
        className,
      )}
      style={{ paddingLeft: nivel * sangria }}
      {...(arrastre?.props ?? {})}
    >
      {tieneHijos ? (
        <button
          type="button"
          aria-label={abierto ? t('arbol.contraer', { titulo }) : t('arbol.expandir', { titulo })}
          aria-expanded={!!abierto}
          onClick={(e) => {
            e.stopPropagation();
            onAlternar?.();
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {abierto ? (
            <ChevronDown aria-hidden="true" className="size-4" strokeWidth={1.5} />
          ) : (
            <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
          )}
        </button>
      ) : (
        <span aria-hidden="true" className="size-6 shrink-0" />
      )}

      {miniatura ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL de Storage de la organización, sin dominio fijo para next/image
        <img src={miniatura} alt="" className="size-8 shrink-0 rounded-lg border border-line object-cover" />
      ) : Icono ? (
        <span
          aria-hidden="true"
          style={cajaTinte}
          className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', !color && 'bg-brand-tint text-brand')}
        >
          <Icono className="size-4" strokeWidth={1.5} />
        </span>
      ) : null}

      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn('truncate text-sm font-medium leading-5', contexto ? 'text-fg-secondary' : 'text-fg')}>
            {titulo}
          </span>
          {extra}
        </span>
        {subtitulo && <span className="truncate text-xs leading-4 text-fg-muted">{subtitulo}</span>}
      </span>
    </div>
  );
}
