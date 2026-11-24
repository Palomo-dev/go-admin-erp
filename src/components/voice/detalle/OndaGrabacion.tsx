'use client';

/**
 * Onda del reproductor del detalle de una llamada (Figma 1363:20): barras que
 * hacen de barra de progreso. Es un `slider` accesible: clic para saltar,
 * ←/→ ±5 s, Inicio/Fin. Las alturas salen de `barrasOnda` (estables por llamada).
 */

import { useMemo, type KeyboardEvent, type MouseEvent } from 'react';
import { cn } from '@/utils/Utils';
import { barrasOnda, formatoReloj } from './llamadaDetalleLogica';

interface OndaGrabacionProps {
  semilla: string;
  barras: number;
  actualMs: number;
  duracionMs: number;
  etiqueta: string;
  onIr: (ms: number) => void;
  /** Sin duración todavía: el primer clic solo prepara el audio. */
  onPreparar: () => void;
}

export function OndaGrabacion({ semilla, barras, actualMs, duracionMs, etiqueta, onIr, onPreparar }: OndaGrabacionProps) {
  const alturas = useMemo(() => barrasOnda(semilla, barras), [semilla, barras]);
  const pct = duracionMs > 0 ? Math.min(1, actualMs / duracionMs) : 0;

  const mover = (e: MouseEvent<HTMLDivElement>) => {
    if (!duracionMs) return onPreparar();
    const r = e.currentTarget.getBoundingClientRect();
    onIr(((e.clientX - r.left) / Math.max(1, r.width)) * duracionMs);
  };
  const teclas = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      onIr(actualMs + (e.key === 'ArrowRight' ? 5000 : -5000));
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      onIr(e.key === 'Home' ? 0 : duracionMs);
    }
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={etiqueta}
      aria-valuemin={0}
      aria-valuemax={Math.round(duracionMs / 1000)}
      aria-valuenow={Math.round(actualMs / 1000)}
      aria-valuetext={`${formatoReloj(actualMs)} / ${formatoReloj(duracionMs)}`}
      onClick={mover}
      onKeyDown={teclas}
      className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-[3px] overflow-hidden rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {alturas.map((h, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cn('w-[3px] shrink-0 rounded-full', (i + 0.5) / alturas.length <= pct ? 'bg-brand' : 'bg-line-strong')}
          style={{ height: `${Math.round(h * 100)}%` }}
        />
      ))}
    </div>
  );
}
