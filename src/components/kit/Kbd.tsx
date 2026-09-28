'use client';

import { cn } from '@/utils/Utils';
import type { TemaKbd } from './botonClases';
import { etiquetaAtajo, TECLAS_CON_NOMBRE, type TeclaConNombre } from './teclas';
import { useKitT } from './useIdiomaKit';

/**
 * Tecla o atajo dibujado (Figma `Kbd`, sección «POS v2»: Theme light · dark ·
 * on-brand × Length). Sustituye a los `<kbd>` hechos a mano.
 *
 * Es decorativo (`aria-hidden`): el atajo se anuncia con `aria-keyshortcuts`
 * en el botón que lo lleva (`KbdButton` lo hace solo). El texto se normaliza:
 * «ctrl+n» → «Ctrl+N», «supr» → «Supr» (o «Del» en inglés), «↑↓».
 */
export interface KbdProps {
  /** El atajo como lo escriben los diseños: «F9», «Ctrl+N», «Alt+1», «Supr», «Enter», «↑↓». */
  tecla: string;
  /** `claro` sobre superficies, `oscuro` sobre tooltips u hojas oscuras, `marca` dentro de un botón de color. */
  tema?: TemaKbd;
  /** sm 20 · md 24 px de alto. */
  tamano?: 'sm' | 'md';
  className?: string;
}

const TEMA: Record<TemaKbd, string> = {
  claro: 'border-line bg-subtle text-fg-muted',
  oscuro: 'border-line-strong bg-tooltip text-fg-on-brand',
  marca: 'border-fg-on-brand/40 bg-fg-on-brand/15 text-fg-on-brand',
};

/** Nombres de las teclas con nombre en el idioma activo (`kit.teclas`). */
export function useNombresTecla(): Record<TeclaConNombre, string> {
  const t = useKitT();
  const nombres = {} as Record<TeclaConNombre, string>;
  for (const id of TECLAS_CON_NOMBRE) nombres[id] = t(`teclas.${id}`);
  return nombres;
}

export function Kbd({ tecla, tema = 'claro', tamano = 'sm', className }: KbdProps) {
  const nombres = useNombresTecla();
  const texto = etiquetaAtajo(tecla, nombres);
  if (!texto) return null;
  return (
    <kbd
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded border font-sans font-medium leading-none tabular-nums',
        tamano === 'sm' ? 'h-5 min-w-5 px-1 text-[11px]' : 'h-6 min-w-6 px-1.5 text-xs',
        TEMA[tema],
        className,
      )}
    >
      {texto}
    </kbd>
  );
}
