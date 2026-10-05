'use client';

import { Check } from 'lucide-react';
import { cn } from '@/utils/Utils';

/**
 * Pasos de un asistente (Figma «Importar productos»: Origen — Mapeo —
 * Validación — Previsualización — Resultado).
 *
 * - Escritorio (≥ lg): fila de círculos numerados unidos por una línea; los
 *   completados llevan ✓ en azul, el actual va resaltado y los pendientes en gris.
 * - Móvil: «Paso 2 de 5 · Mapeo» y una barra de avance (los círculos no caben).
 *
 * Es una `ol` con `aria-current="step"` en el paso actual. Los pasos
 * completados pueden ser botones (`onPasoClick`) para volver atrás; los
 * pendientes nunca (no se salta un paso sin validar el anterior).
 */
export interface PasoStepper<V extends string = string> {
  valor: V;
  etiqueta: string;
}

export interface StepperProps<V extends string = string> {
  pasos: readonly PasoStepper<V>[];
  actual: V;
  /** Volver a un paso ya completado. */
  onPasoClick?: (valor: V) => void;
  /** Texto de móvil: `(n, total, etiqueta) => 'Paso 2 de 5 · Mapeo'`. */
  resumenMovil: (numero: number, total: number, etiqueta: string) => string;
  /** Nombre accesible de la lista. */
  etiqueta: string;
  /** A la derecha en escritorio («Origen: archivo · Sucursal destino: Centro»). */
  extra?: React.ReactNode;
  className?: string;
  /** Pasos del editor IA: píldoras numeradas que envuelven sin cortar etiquetas. */
  formato?: 'lineal' | 'chips';
  deshabilitado?: boolean;
}

export function Stepper<V extends string>({ pasos, actual, onPasoClick, resumenMovil, etiqueta, extra, className, formato = 'lineal', deshabilitado = false }: StepperProps<V>) {
  const indice = Math.max(0, pasos.findIndex((p) => p.valor === actual));
  const total = pasos.length;
  if (formato === 'chips') return <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
    <ol aria-label={etiqueta} className="flex flex-wrap gap-1.5">
      {pasos.map((p, i) => {
        const hecho = i < indice, actual = i === indice, clicable = hecho && !!onPasoClick;
        const contenido = <><span aria-hidden className={cn('flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold', actual ? 'bg-brand-action text-fg-on-brand' : hecho ? 'bg-success-subtle text-success-text' : 'bg-subtle text-fg-secondary')}>{hecho ? <Check className="size-3" strokeWidth={1.5} /> : i + 1}</span><span>{p.etiqueta}</span></>;
        const clases = cn('inline-flex min-h-[33px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] leading-[18px]', actual ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line bg-surface text-fg-secondary');
        return <li key={p.valor} className="flex items-center gap-1.5" aria-current={actual ? 'step' : undefined}>{clicable ? <button type="button" disabled={deshabilitado} onClick={() => onPasoClick?.(p.valor)} className={cn(clases, 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50')}>{contenido}</button> : <span className={clases}>{contenido}</span>}{i === total - 1 && <p className="text-xs text-fg-secondary" aria-live="polite">{resumenMovil(indice + 1, total, pasos[indice]?.etiqueta ?? '')}</p>}</li>;
      })}
    </ol>
    {extra}
  </div>;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Móvil */}
      <div className="flex flex-col gap-1.5 lg:hidden">
        <p className="text-sm font-medium text-fg" aria-live="polite">
          {resumenMovil(indice + 1, total, pasos[indice]?.etiqueta ?? '')}
        </p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle" aria-hidden="true">
          <div className="h-full rounded-full bg-brand-action transition-all" style={{ width: `${((indice + 1) / total) * 100}%` }} />
        </div>
      </div>

      {/* Escritorio */}
      <div className="hidden items-center justify-between gap-4 lg:flex">
        <ol aria-label={etiqueta} className="flex min-w-0 flex-1 items-center gap-2">
          {pasos.map((p, i) => {
            const estado = i < indice ? 'hecho' : i === indice ? 'actual' : 'pendiente';
            const clicable = estado === 'hecho' && !!onPasoClick;
            const contenido = (
              <>
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    estado === 'hecho' && 'bg-brand-action text-fg-on-brand',
                    estado === 'actual' && 'bg-brand-action text-fg-on-brand ring-4 ring-brand-tint',
                    estado === 'pendiente' && 'border border-line-strong bg-surface text-fg-muted',
                  )}
                  aria-hidden="true"
                >
                  {estado === 'hecho' ? <Check className="size-3.5" strokeWidth={2.5} /> : i + 1}
                </span>
                <span className={cn('truncate text-sm', estado === 'actual' ? 'font-semibold text-fg' : estado === 'hecho' ? 'text-fg-secondary' : 'text-fg-muted')}>
                  {p.etiqueta}
                </span>
              </>
            );
            return (
              <li key={p.valor} className="flex min-w-0 items-center gap-2" aria-current={estado === 'actual' ? 'step' : undefined}>
                {clicable ? (
                  <button
                    type="button"
                    disabled={deshabilitado}
                    onClick={() => onPasoClick?.(p.valor)}
                    className="flex min-w-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {contenido}
                  </button>
                ) : (
                  <span className="flex min-w-0 items-center gap-2">{contenido}</span>
                )}
                {i < total - 1 && <span className={cn('h-px w-6 shrink-0 xl:w-10', i < indice ? 'bg-brand-action' : 'bg-line-strong')} aria-hidden="true" />}
              </li>
            );
          })}
        </ol>
        {extra && <div className="shrink-0 text-xs text-fg-secondary">{extra}</div>}
      </div>
    </div>
  );
}
