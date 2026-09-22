/**
 * Clases de las fichas (condición o acción) de la frase construible. Sin JSX
 * para que se prueben EJECUTADAS en jest (`jsx: preserve` impide importar
 * .tsx desde los tests). `SentenceBlock.tsx` las reexporta.
 */

import { cn } from '@/utils/Utils';

export type Tone = 'blue' | 'amber' | 'emerald';

/**
 * Ficha como botón: `aria-expanded` dice si su editor está abierto.
 * Seleccionada = borde y fondo del tono del bloque.
 *
 * `stacked`: en móvil la ficha es una tarjeta a ancho completo cuyo texto
 * envuelve (UX móvil ronda 1: las frases largas sobresalían del borde); desde
 * `sm` vuelve a ser la píldora en línea con el texto truncado.
 */
export function chipClass(selected: boolean, tone: Tone = 'blue', stacked = false): string {
  const selectedTone: Record<Tone, string> = {
    blue: 'border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-950/60 dark:text-blue-100',
    amber: 'border-amber-600 bg-amber-50 text-amber-900 dark:border-amber-400 dark:bg-amber-950/50 dark:text-amber-100',
    emerald: 'border-emerald-700 bg-emerald-50 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-950/50 dark:text-emerald-100',
  };
  return cn(
    'inline-flex min-w-0 max-w-full gap-1.5 border px-3 py-1.5 text-left text-sm transition-colors',
    stacked
      ? 'w-full items-start rounded-lg sm:w-auto sm:items-center sm:rounded-full'
      : 'items-center rounded-full',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900',
    selected
      ? selectedTone[tone]
      : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800',
  );
}

/**
 * Texto de una ficha apilada: envuelve en móvil, se trunca en línea desde `sm`.
 * Sin `sm:flex-none` (tester UXM-C): con `flex: none` el texto no encoge y
 * `sm:truncate` nunca actúa: a 768 px medía 897 px dentro de una píldora de
 * 670 y el formulario ganaba scroll lateral (1120 px en 752).
 */
export const CHIP_TEXT_CLASS = 'min-w-0 flex-1 break-words sm:truncate';
/** Icono de una ficha apilada: alineado con la primera línea en móvil, centrado desde `sm`. */
export const CHIP_ICON_CLASS = 'mt-[3px] h-3.5 w-3.5 shrink-0 sm:mt-0';
/** Contenedor de fichas: lista apilada en móvil, fichas en línea que envuelven desde `sm`. */
export const CHIP_LIST_CLASS = 'flex flex-col gap-2 sm:flex-row sm:flex-wrap';
