'use client';

import { cn } from '@/utils/Utils';

/**
 * Barra de progreso con tokens (Figma Sitio web A/02a «Lista de lanzamiento»:
 * «5 de 7 pasos»; asistente A/03 en la cabecera). Pista `bg-subtle`, relleno
 * del tono; sin animación si la persona pide movimiento reducido.
 */
export type TonoProgreso = 'marca' | 'exito' | 'advertencia' | 'peligro';

export interface BarraProgresoProps {
  valor: number;
  max?: number;
  /** Nombre accesible («Lista de lanzamiento»). */
  etiqueta: string;
  /** Texto del valor para el lector de pantalla («5 de 7 pasos»). */
  textoValor?: string;
  tono?: TonoProgreso;
  /** sm 4 px · md 8 px. */
  tamano?: 'sm' | 'md';
  className?: string;
}

const RELLENO: Record<TonoProgreso, string> = {
  marca: 'bg-brand',
  exito: 'bg-success',
  advertencia: 'bg-warning',
  peligro: 'bg-danger',
};

/** Porcentaje entero acotado a 0–100 (max ≤ 0 → 0). */
export function porcentajeProgreso(valor: number, max: number): number {
  if (!Number.isFinite(valor) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((valor / max) * 100)));
}

export function BarraProgreso({ valor, max = 100, etiqueta, textoValor, tono = 'marca', tamano = 'md', className }: BarraProgresoProps) {
  const pct = porcentajeProgreso(valor, max);
  return (
    <div
      role="progressbar"
      aria-label={etiqueta}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.max(0, Math.min(valor, max))}
      aria-valuetext={textoValor}
      className={cn('w-full overflow-hidden rounded-full bg-subtle', tamano === 'sm' ? 'h-1' : 'h-2', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none', RELLENO[tono])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
