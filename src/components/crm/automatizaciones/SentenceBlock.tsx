'use client';

/**
 * Un bloque de la frase construible: «Cuando · si · entonces». La palabra va
 * como cabecera del grupo (`aria-labelledby`), el contenido se edita en su
 * sitio. Los tres bloques comparten este marco para que la frase se lea de
 * arriba abajo como una sola oración.
 */

import { cn } from '@/utils/Utils';

type Tone = 'blue' | 'amber' | 'emerald';

const TONE: Record<Tone, string> = {
  // Contraste AA verificado: blue-600/blanco 5,2:1; amber-500/gray-950 10:1; emerald-700/blanco 5,5:1.
  blue: 'bg-blue-600 text-white',
  amber: 'bg-amber-500 text-gray-950',
  emerald: 'bg-emerald-700 text-white',
};

interface Props {
  id: string;
  word: string;
  tone: Tone;
  hint?: string;
  children: React.ReactNode;
  /** Botones a la derecha de la palabra (añadir, JSON…). */
  aside?: React.ReactNode;
}

export function SentenceBlock({ id, word, tone, hint, children, aside }: Props) {
  return (
    <section
      aria-labelledby={`${id}-word`}
      className="relative rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            id={`${id}-word`}
            className={cn('inline-flex h-7 items-center rounded-md px-2.5 text-sm font-semibold', TONE[tone])}
          >
            {word}
          </span>
          {hint && <span className="text-xs text-gray-600 dark:text-gray-400">{hint}</span>}
        </div>
        {aside && <div className="flex items-center gap-1">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** Conector visual entre bloques (decorativo). */
export function SentenceConnector() {
  return <div aria-hidden="true" className="ml-6 h-4 w-px bg-gray-300 dark:bg-gray-700" />;
}

/**
 * Ficha (condición o acción) como botón: `aria-expanded` dice si su editor
 * está abierto. Seleccionada = borde y fondo del tono del bloque.
 */
export function chipClass(selected: boolean, tone: Tone = 'blue'): string {
  const selectedTone: Record<Tone, string> = {
    blue: 'border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-950/60 dark:text-blue-100',
    amber: 'border-amber-600 bg-amber-50 text-amber-900 dark:border-amber-400 dark:bg-amber-950/50 dark:text-amber-100',
    emerald: 'border-emerald-700 bg-emerald-50 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-950/50 dark:text-emerald-100',
  };
  return cn(
    'inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-sm transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900',
    selected
      ? selectedTone[tone]
      : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800',
  );
}
