'use client';

/**
 * Un bloque de la frase construible: «Cuando · si · entonces». La palabra va
 * como cabecera del grupo (`aria-labelledby`), el contenido se edita en su
 * sitio. Los tres bloques comparten este marco para que la frase se lea de
 * arriba abajo como una sola oración.
 */

import { Filter, Play, Zap } from 'lucide-react';
import { Tarjeta } from '@/components/kit/Tarjeta';
import type { Tone } from './chipClasses';

const ICON: Record<Tone, typeof Zap> = { blue: Zap, amber: Filter, emerald: Play };

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
  return <Tarjeta id={id} titulo={word} icono={ICON[tone]} descripcion={hint} accion={aside}>{children}</Tarjeta>;
}

/** Conector visual entre bloques (decorativo). */
export function SentenceConnector() {
  return <div aria-hidden="true" className="mx-auto h-4 w-px bg-line-strong" />;
}

/** Fichas: clases sin JSX en `chipClasses.ts` (se prueban ejecutadas); se reexportan aquí. */
export { chipClass, CHIP_ICON_CLASS, CHIP_LIST_CLASS, CHIP_TEXT_CLASS } from './chipClasses';
