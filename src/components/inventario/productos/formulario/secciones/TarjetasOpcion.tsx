'use client';

import { useRef, type ReactNode } from 'react';
import { CircleCheck, type LucideIcon } from 'lucide-react';
import { indiceSiguiente } from '@/components/kit/navegacionTeclado';
import { cn } from '@/utils/Utils';

/**
 * Tarjetas de opción única (Figma A1: «¿Qué tipo de servicio es?», «Renovación y cobro»):
 * radiogroup WAI-ARIA con foco itinerante y flechas, como `SegmentedControl`, pero con icono,
 * título y descripción. Una opción deshabilitada explica por qué (`motivo`).
 */
export interface OpcionTarjeta<V extends string> {
  valor: V;
  titulo: string;
  descripcion: string;
  icono: LucideIcon;
  deshabilitada?: boolean;
  /** Por qué no se puede elegir (se lee junto a la descripción). */
  motivo?: string;
  /** Insignia a la derecha del título («Fase posterior»). */
  insignia?: ReactNode;
}

export interface TarjetasOpcionProps<V extends string> {
  opciones: readonly OpcionTarjeta<V>[];
  valor: V;
  onValorChange: (valor: V) => void;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  etiqueta?: string;
  /** Columnas desde `sm` (en móvil, una). */
  columnas?: 2 | 3;
  deshabilitado?: boolean;
  className?: string;
}

export function TarjetasOpcion<V extends string>({
  opciones,
  valor,
  onValorChange,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  etiqueta,
  columnas = 3,
  deshabilitado,
  className,
}: TarjetasOpcionProps<V>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const deshabilitados = opciones.map((o) => !!o.deshabilitada || !!deshabilitado);
  const actual = Math.max(0, opciones.findIndex((o) => o.valor === valor));

  const alPulsar = (e: React.KeyboardEvent, i: number) => {
    const siguiente = indiceSiguiente(i, opciones.length, e.key, deshabilitados);
    if (siguiente === null) return;
    e.preventDefault();
    refs.current[siguiente]?.focus();
    onValorChange(opciones[siguiente].valor);
  };

  return (
    <div
      role="radiogroup"
      aria-label={labelledBy ? undefined : etiqueta}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-disabled={deshabilitado || undefined}
      className={cn('grid grid-cols-1 gap-3', columnas === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2', className)}
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
            tabIndex={i === actual ? 0 : -1}
            disabled={deshabilitados[i]}
            onClick={() => onValorChange(o.valor)}
            onKeyDown={(e) => alPulsar(e, i)}
            className={cn(
              'flex min-w-0 flex-col gap-2 rounded-lg border p-3 text-left transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed',
              activa ? 'border-brand bg-brand-tint' : 'border-line bg-surface hover:bg-hover',
              deshabilitados[i] && !activa && 'opacity-60',
            )}
          >
            <span className="flex items-center gap-2">
              <Icono aria-hidden="true" className={cn('size-4 shrink-0', activa ? 'text-brand' : 'text-fg-secondary')} strokeWidth={1.5} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{o.titulo}</span>
              {o.insignia}
              {activa && <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-brand" strokeWidth={1.5} />}
            </span>
            <span className="text-xs text-fg-secondary">{o.descripcion}</span>
            {o.motivo && deshabilitados[i] && <span className="text-xs text-warning-text">{o.motivo}</span>}
          </button>
        );
      })}
    </div>
  );
}
