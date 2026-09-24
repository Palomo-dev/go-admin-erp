'use client';

import { useRef, type KeyboardEvent } from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, Ellipsis } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Kbd } from './Kbd';
import { atajoMetodo, elegidoEnResto, iconoMetodoPago, repartirMetodos, type MetodoPagoOpcion } from './metodosPago';
import { indiceSiguiente } from './navegacionTeclado';
import { ariaAtajo } from './teclas';
import { useKitT } from './useIdiomaKit';

/**
 * Botones de método de pago (cobro del POS, diálogo único de pago, mesas):
 * los N primeros métodos **de la organización** como botones y el resto en
 * «Otro ▾». Nunca una lista fija (grave 9 de POS-UX-V2).
 *
 * Es un `radiogroup` con flechas; con `atajos` cada botón muestra su
 * «Alt+1…» y lo anuncia con `aria-keyshortcuts` (el registro de teclas lo
 * hace la pantalla con `useAtajos`, llamando a `onValorChange`).
 */
export interface SelectorMetodoPagoProps {
  metodos: readonly MetodoPagoOpcion[];
  valor: string | null;
  onValorChange: (codigo: string) => void;
  /** Botones visibles antes de «Otro» (por defecto 4). */
  maxBotones?: number;
  /** Muestra y anuncia Alt+1…n por posición. */
  atajos?: boolean;
  etiqueta?: string;
  deshabilitado?: boolean;
  className?: string;
}

export function SelectorMetodoPago({
  metodos,
  valor,
  onValorChange,
  maxBotones = 4,
  atajos,
  etiqueta,
  deshabilitado,
  className,
}: SelectorMetodoPagoProps) {
  const t = useKitT();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const { visibles, resto } = repartirMetodos(metodos, maxBotones);
  const enResto = elegidoEnResto(resto, valor);
  const deshabilitados = visibles.map((m) => !!m.deshabilitado || !!deshabilitado);
  const indiceElegido = visibles.findIndex((m) => m.codigo === valor);
  const indiceFoco = indiceElegido >= 0 ? indiceElegido : Math.max(0, deshabilitados.indexOf(false));

  const alPulsar = (e: KeyboardEvent, i: number) => {
    const siguiente = indiceSiguiente(i, visibles.length, e.key, deshabilitados);
    if (siguiente === null) return;
    e.preventDefault();
    refs.current[siguiente]?.focus();
    onValorChange(visibles[siguiente].codigo);
  };

  const columnas = visibles.length + (resto.length > 0 ? 1 : 0);
  if (metodos.length === 0) {
    return <p className={cn('rounded-lg border border-dashed border-line-strong px-3 py-3 text-sm text-fg-secondary', className)}>{t('pagos.sinMetodos')}</p>;
  }

  return (
    <div className={cn('grid grid-cols-2 gap-2', columnas >= 3 && 'sm:grid-cols-3', columnas >= 4 && 'lg:grid-cols-4', columnas >= 5 && 'xl:grid-cols-5', className)}>
      <div role="radiogroup" aria-label={etiqueta ?? t('pagos.metodo')} className="contents">
        {visibles.map((m, i) => {
          const Icono = m.icono ?? iconoMetodoPago(m.codigo);
          const activo = m.codigo === valor;
          const atajo = atajos ? atajoMetodo(i) : undefined;
          return (
            <button
              key={m.codigo}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={activo}
              aria-keyshortcuts={atajo ? ariaAtajo(atajo) : undefined}
              title={deshabilitados[i] ? m.motivo : undefined}
              tabIndex={i === indiceFoco ? 0 : -1}
              disabled={deshabilitados[i]}
              onClick={() => onValorChange(m.codigo)}
              onKeyDown={(e) => alPulsar(e, i)}
              className={cn(
                'relative flex h-14 min-w-0 items-center gap-2 rounded-lg border px-3 text-left text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50',
                activo ? 'border-line-brand bg-brand-tint text-brand-deep ring-1 ring-brand' : 'border-line-strong bg-surface text-fg hover:bg-hover',
              )}
            >
              <Icono aria-hidden="true" className={cn('size-5 shrink-0', activo ? 'text-brand' : 'text-fg-secondary')} strokeWidth={1.5} />
              <span className="min-w-0 flex-1 truncate">{m.nombre}</span>
              {atajo && <Kbd tecla={atajo} className="hidden lg:inline-flex" />}
              {deshabilitados[i] && m.motivo && <span className="sr-only">{m.motivo}</span>}
            </button>
          );
        })}
      </div>
      {resto.length > 0 && (
        <DropdownMenuPrimitive.Root>
          <DropdownMenuPrimitive.Trigger asChild>
            <button
              type="button"
              disabled={deshabilitado}
              aria-label={enResto ? t('pagos.otroElegido', { metodo: enResto.nombre }) : t('pagos.otro')}
              className={cn(
                'flex h-14 min-w-0 items-center gap-2 rounded-lg border px-3 text-left text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50',
                enResto ? 'border-line-brand bg-brand-tint text-brand-deep ring-1 ring-brand' : 'border-line-strong bg-surface text-fg hover:bg-hover',
              )}
            >
              <Ellipsis aria-hidden="true" className="size-5 shrink-0 text-fg-secondary" strokeWidth={1.5} />
              <span className="min-w-0 flex-1 truncate">{enResto ? enResto.nombre : t('pagos.otro')}</span>
              <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
            </button>
          </DropdownMenuPrimitive.Trigger>
          <DropdownMenuPrimitive.Portal>
            <DropdownMenuPrimitive.Content
              align="end"
              sideOffset={4}
              collisionPadding={8}
              className="z-50 max-h-[320px] min-w-[200px] overflow-y-auto rounded-xl border border-line bg-surface p-1 text-fg shadow-lg outline-none"
            >
              <DropdownMenuPrimitive.RadioGroup value={valor ?? ''} onValueChange={onValorChange}>
                {resto.map((m) => {
                  const Icono = m.icono ?? iconoMetodoPago(m.codigo);
                  return (
                    <DropdownMenuPrimitive.RadioItem
                      key={m.codigo}
                      value={m.codigo}
                      disabled={m.deshabilitado}
                      className="flex min-h-9 cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm outline-none data-[disabled]:cursor-not-allowed data-[highlighted]:bg-hover data-[disabled]:opacity-60"
                    >
                      <Icono aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{m.nombre}</span>
                        {m.deshabilitado && m.motivo && <span className="text-xs text-fg-muted">{m.motivo}</span>}
                      </span>
                      <DropdownMenuPrimitive.ItemIndicator>
                        <Check aria-hidden="true" className="size-4 text-brand" strokeWidth={2} />
                      </DropdownMenuPrimitive.ItemIndicator>
                    </DropdownMenuPrimitive.RadioItem>
                  );
                })}
              </DropdownMenuPrimitive.RadioGroup>
            </DropdownMenuPrimitive.Content>
          </DropdownMenuPrimitive.Portal>
        </DropdownMenuPrimitive.Root>
      )}
    </div>
  );
}
