'use client';

import { Check } from 'lucide-react';
import { cn } from '@/utils/Utils';

/**
 * Chips de elección (Figma `Chip Variant=choice`, diálogos «Generar cierre» y
 * «Programar envío»): píldoras que envuelven, la elegida con tinte de marca y
 * «✓». Una sola opción (`radiogroup`); para varias, `multiple`.
 */
export interface OpcionChip<V extends string> {
  valor: V;
  etiqueta: string;
  deshabilitada?: boolean;
  /** Por qué está deshabilitada (`title` y lector de pantalla). */
  motivo?: string;
}

interface Comunes<V extends string> {
  opciones: readonly OpcionChip<V>[];
  /** Nombre del grupo (si no hay etiqueta visible enlazada con `aria-labelledby`). */
  etiqueta?: string;
  'aria-labelledby'?: string;
  className?: string;
}

export type ChipsOpcionProps<V extends string> = Comunes<V> &
  ({ multiple?: false; valor: V; onValorChange: (valor: V) => void } | { multiple: true; valor: readonly V[]; onValorChange: (valor: V[]) => void });

export function ChipsOpcion<V extends string>(props: ChipsOpcionProps<V>) {
  const { opciones, etiqueta, className } = props;
  const elegida = (v: V) => (props.multiple ? props.valor.includes(v) : props.valor === v);
  const alternar = (v: V) => {
    if (props.multiple) props.onValorChange(props.valor.includes(v) ? props.valor.filter((x) => x !== v) : [...props.valor, v]);
    else props.onValorChange(v);
  };

  return (
    <div
      role={props.multiple ? 'group' : 'radiogroup'}
      aria-label={etiqueta}
      aria-labelledby={props['aria-labelledby']}
      className={cn('flex flex-wrap gap-2', className)}
    >
      {opciones.map((o) => {
        const activa = elegida(o.valor);
        return (
          <button
            key={o.valor}
            type="button"
            role={props.multiple ? 'checkbox' : 'radio'}
            aria-checked={activa}
            disabled={o.deshabilitada}
            title={o.deshabilitada ? o.motivo : undefined}
            onClick={() => alternar(o.valor)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50',
              activa ? 'border-brand bg-brand-tint text-brand-deep' : 'border-line-strong bg-surface text-fg hover:bg-hover',
            )}
          >
            {activa && <Check aria-hidden className="size-3.5" strokeWidth={2} />}
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
