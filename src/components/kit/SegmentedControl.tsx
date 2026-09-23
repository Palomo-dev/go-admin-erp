'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { indiceSiguiente } from './navegacionTeclado';

/**
 * Control segmentado (Figma `SegmentedControl`): elegir una opción entre
 * 2–4 visibles (Todos · Persona · Empresa; Con stock · Todos · Bajo mínimo).
 * Es un `radiogroup`: Tab entra en la opción elegida y las flechas cambian
 * (se salta las deshabilitadas).
 */
export interface OpcionSegmento<V extends string> {
  valor: V;
  etiqueta: string;
  icono?: LucideIcon;
  /** Contador a la derecha («Abiertas 3»). */
  contador?: number;
  deshabilitada?: boolean;
  /** Para opciones solo con icono (vista tabla/cuadrícula). */
  soloIcono?: boolean;
}

export interface SegmentedControlProps<V extends string> {
  opciones: readonly OpcionSegmento<V>[];
  valor: V;
  onValorChange: (valor: V) => void;
  /** Nombre del grupo si no hay etiqueta visible (dentro de `FormField`, usa `aria-labelledby`). */
  etiqueta?: string;
  tamano?: 'sm' | 'md';
  anchoCompleto?: boolean;
  deshabilitado?: boolean;
  id?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  className?: string;
}

export function SegmentedControl<V extends string>({
  opciones,
  valor,
  onValorChange,
  etiqueta,
  tamano = 'md',
  anchoCompleto,
  deshabilitado,
  id,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  className,
}: SegmentedControlProps<V>) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const indiceActual = Math.max(
    0,
    opciones.findIndex((o) => o.valor === valor),
  );
  const deshabilitados = opciones.map((o) => !!o.deshabilitada || !!deshabilitado);

  const alPulsar = (e: React.KeyboardEvent, i: number) => {
    const siguiente = indiceSiguiente(i, opciones.length, e.key, deshabilitados);
    if (siguiente === null) return;
    e.preventDefault();
    refs.current[siguiente]?.focus();
    onValorChange(opciones[siguiente].valor);
  };

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={labelledBy ? undefined : etiqueta}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-disabled={deshabilitado || undefined}
      className={cn(
        'inline-flex items-center gap-1 rounded-lg bg-subtle p-1',
        anchoCompleto && 'flex w-full',
        className,
      )}
    >
      {opciones.map((o, i) => {
        const activa = o.valor === valor;
        const Icono = o.icono;
        return (
          <button
            key={o.valor}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={activa}
            aria-label={o.soloIcono ? o.etiqueta : undefined}
            title={o.soloIcono ? o.etiqueta : undefined}
            tabIndex={i === indiceActual ? 0 : -1}
            disabled={deshabilitados[i]}
            onClick={() => onValorChange(o.valor)}
            onKeyDown={(e) => alPulsar(e, i)}
            className={cn(
              'inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50',
              tamano === 'md' ? 'h-8 px-3 text-sm' : 'h-7 px-2.5 text-[13px]',
              o.soloIcono && (tamano === 'md' ? 'w-8 px-0' : 'w-7 px-0'),
              anchoCompleto && 'flex-1',
              activa ? 'bg-surface text-fg shadow-sm' : 'text-fg-secondary hover:text-fg',
            )}
          >
            {Icono && <Icono aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />}
            {!o.soloIcono && <span className="truncate">{o.etiqueta}</span>}
            {o.contador !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-[11px] font-semibold leading-4 tabular-nums',
                  activa ? 'bg-brand-tint text-brand-deep' : 'bg-surface text-fg-secondary',
                )}
              >
                {o.contador}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
