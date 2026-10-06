'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { CircleCheck, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';

/**
 * Tarjeta seleccionable con icono (Figma Sitio web A/03a «¿Qué tipo de negocio
 * es?»: Restaurante, Tienda, Hotel…; también sirve para elegir modo en Sedes en
 * la web). Seleccionada: borde `brand`, fondo tinte y texto profundo.
 *
 * - `vertical`: icono en círculo arriba y nombre debajo (giro).
 * - `horizontal`: icono a la izquierda, título y descripción, check a la derecha.
 *
 * Accesible como `radio` (dentro de un `role="radiogroup"` que pone quien la
 * usa) o como `checkbox` para selección múltiple.
 */
export interface TarjetaSeleccionableProps {
  titulo: string;
  descripcion?: ReactNode;
  icono?: LucideIcon;
  seleccionada: boolean;
  onSeleccionar: () => void;
  orientacion?: 'vertical' | 'horizontal';
  rol?: 'radio' | 'checkbox';
  deshabilitada?: boolean;
  className?: string;
}

export function TarjetaSeleccionable({
  titulo,
  descripcion,
  icono: Icono,
  seleccionada,
  onSeleccionar,
  orientacion = 'vertical',
  rol = 'radio',
  deshabilitada,
  className,
}: TarjetaSeleccionableProps) {
  const alPulsarTecla = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' && rol === 'radio') {
      e.preventDefault();
      onSeleccionar();
    }
  };
  const vertical = orientacion === 'vertical';
  return (
    <button
      type="button"
      role={rol}
      aria-checked={seleccionada}
      disabled={deshabilitada}
      onClick={onSeleccionar}
      onKeyDown={alPulsarTecla}
      className={cn(
        'group relative flex rounded-xl border bg-surface text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        vertical ? 'min-h-[88px] flex-col items-center justify-center gap-2 px-3 py-4 text-center' : 'items-start gap-3 p-4',
        seleccionada ? 'border-brand bg-brand-tint ring-1 ring-brand' : 'border-line hover:bg-hover',
        className,
      )}
    >
      {Icono && (
        <span
          aria-hidden="true"
          className={cn(
            'flex shrink-0 items-center justify-center',
            vertical ? 'size-10 rounded-full' : 'size-10 rounded-lg',
            seleccionada ? 'bg-surface text-brand' : 'bg-subtle text-fg-secondary',
          )}
        >
          <Icono className="size-5" strokeWidth={1.5} />
        </span>
      )}
      <span className={cn('flex min-w-0 flex-col gap-0.5', !vertical && 'flex-1')}>
        <span className={cn('text-sm font-medium leading-5', seleccionada ? 'text-brand-deep' : 'text-fg')}>{titulo}</span>
        {descripcion ? <span className="text-[13px] leading-[18px] text-fg-secondary">{descripcion}</span> : null}
      </span>
      {!vertical && seleccionada && <CircleCheck aria-hidden="true" className="size-5 shrink-0 text-brand" strokeWidth={1.5} />}
    </button>
  );
}
