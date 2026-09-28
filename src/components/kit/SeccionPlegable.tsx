'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Kbd } from './Kbd';
import { ariaAtajo } from './teclas';

/**
 * Sección que se pliega (Figma `CheckoutAccordion` closed · open): Entrega ·
 * Alt+D, Propina · Alt+P, Comisión, Factura electrónica · Alt+F en el cobro;
 * sirve igual en formularios largos de documentos.
 *
 * A diferencia de `FormSection colapsable`, la cabecera lleva un **resumen**
 * de lo elegido («Domicilio · $ 5.000», «10 %») y el atajo. El contenido
 * plegado sigue montado (no se pierde lo escrito). Controlada (`abierta` +
 * `onAbiertaChange`) o no (`abiertaPorDefecto`); el atajo lo registra la
 * pantalla con `useAtajos` y llama a `onAbiertaChange`.
 */
export interface SeccionPlegableProps {
  titulo: string;
  /** Lo elegido, a la derecha del título cuando está cerrada o abierta. */
  resumen?: ReactNode;
  icono?: LucideIcon;
  atajo?: string;
  abierta?: boolean;
  onAbiertaChange?: (abierta: boolean) => void;
  abiertaPorDefecto?: boolean;
  deshabilitada?: boolean;
  /** Por qué no se puede abrir («Factura electrónica no configurada»). */
  motivo?: string;
  children: ReactNode;
  id?: string;
  className?: string;
}

export function SeccionPlegable({
  titulo,
  resumen,
  icono: Icono,
  atajo,
  abierta: abiertaProp,
  onAbiertaChange,
  abiertaPorDefecto = false,
  deshabilitada,
  motivo,
  children,
  id,
  className,
}: SeccionPlegableProps) {
  const generado = useId();
  const base = id ?? `plegable-${generado}`;
  const [interna, setInterna] = useState(abiertaPorDefecto);
  const abierta = !deshabilitada && (abiertaProp ?? interna);
  const alternar = () => {
    if (deshabilitada) return;
    const siguiente = !abierta;
    if (abiertaProp === undefined) setInterna(siguiente);
    onAbiertaChange?.(siguiente);
  };
  return (
    <section id={id} className={cn('rounded-lg border bg-surface', abierta ? 'border-line-strong' : 'border-line', className)}>
      <h3 className="m-0">
        <button
          type="button"
          id={`${base}-boton`}
          aria-expanded={abierta}
          aria-controls={`${base}-cuerpo`}
          aria-disabled={deshabilitada || undefined}
          aria-keyshortcuts={atajo ? ariaAtajo(atajo) : undefined}
          aria-describedby={deshabilitada && motivo ? `${base}-motivo` : undefined}
          onClick={alternar}
          className={cn(
            'flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            deshabilitada ? 'cursor-not-allowed opacity-60' : 'hover:bg-hover',
          )}
        >
          {Icono && (
            <span aria-hidden="true" className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', abierta ? 'bg-brand-tint text-brand' : 'bg-subtle text-fg-secondary')}>
              <Icono className="size-4" strokeWidth={1.5} />
            </span>
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-fg">{titulo}</span>
            {deshabilitada && motivo && (
              <span id={`${base}-motivo`} className="truncate text-xs text-fg-muted">
                {motivo}
              </span>
            )}
          </span>
          {resumen && <span className="max-w-[45%] truncate text-right text-[13px] tabular-nums text-fg-secondary">{resumen}</span>}
          {atajo && <Kbd tecla={atajo} className="hidden lg:inline-flex" />}
          <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 text-fg-muted transition-transform', abierta && 'rotate-180')} strokeWidth={1.5} />
        </button>
      </h3>
      {/* `hidden` como clase: montado aunque esté plegada. */}
      <div id={`${base}-cuerpo`} role="region" aria-labelledby={`${base}-boton`} className={abierta ? 'border-t border-line px-3 pb-3 pt-3' : 'hidden'}>
        {children}
      </div>
    </section>
  );
}
