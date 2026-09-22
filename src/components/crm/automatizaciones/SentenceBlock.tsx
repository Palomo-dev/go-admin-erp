'use client';

/**
 * Un bloque de la frase construible: «Cuando · si · entonces». La palabra va
 * como cabecera del grupo (`aria-labelledby`), el contenido se edita en su
 * sitio. Los tres bloques comparten este marco para que la frase se lea de
 * arriba abajo como una sola oración.
 */

import { cn } from '@/utils/Utils';
import type { Tone } from './chipClasses';

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

/** Fichas: clases sin JSX en `chipClasses.ts` (se prueban ejecutadas); se reexportan aquí. */
export { chipClass, CHIP_ICON_CLASS, CHIP_LIST_CLASS, CHIP_TEXT_CLASS } from './chipClasses';
