'use client';

/**
 * Entrada del historial de la ficha (Figma `TimelineEntry` 329:109173, usada
 * en «Historial reciente» 331:113431 y en «Actividad» 331:114345): icono en
 * círculo del tono, título con su badge de estado, una línea de detalle
 * (productos · sucursal…) y otra atenuada (hora · persona).
 */
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';

export type TonoEntrada = 'exito' | 'informacion' | 'marca' | 'advertencia' | 'neutro';

const CIRCULO: Record<TonoEntrada, string> = {
  exito: 'bg-success-subtle text-success-text',
  informacion: 'bg-info-subtle text-info-text',
  marca: 'bg-brand-tint text-brand',
  advertencia: 'bg-warning-subtle text-warning-text',
  neutro: 'bg-subtle text-fg-secondary',
};

export interface EntradaHistorialProps {
  icono: LucideIcon;
  tono: TonoEntrada;
  titulo: ReactNode;
  estado?: ReactNode;
  detalle?: ReactNode;
  meta?: ReactNode;
  /** Contenido extra bajo la meta (consumos de una reserva, notas). */
  children?: ReactNode;
  className?: string;
}

export function EntradaHistorial({ icono: Icono, tono, titulo, estado, detalle, meta, children, className }: EntradaHistorialProps) {
  return (
    <li className={cn('flex items-start gap-3 rounded-lg border border-line bg-surface px-3 py-2.5', className)}>
      <span aria-hidden="true" className={cn('flex size-7 shrink-0 items-center justify-center rounded-full', CIRCULO[tono])}>
        <Icono className="size-3.5" strokeWidth={1.5} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-start gap-1.5">
          <p className="min-w-0 flex-1 break-words text-sm font-medium leading-5 text-fg">{titulo}</p>
          {estado}
        </div>
        {detalle && <p className="break-words text-xs font-medium leading-4 text-fg-secondary">{detalle}</p>}
        {meta && <p className="text-xs font-medium leading-4 text-fg-muted">{meta}</p>}
        {children}
      </div>
    </li>
  );
}

/** Une las partes que existen con « · » (vacías fuera). */
export function unirPartes(partes: readonly (string | null | undefined | false)[]): string {
  return partes.filter((p): p is string => !!p && p.trim() !== '').join(' · ');
}
