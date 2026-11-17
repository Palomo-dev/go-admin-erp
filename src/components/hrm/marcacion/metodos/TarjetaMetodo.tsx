'use client';

/**
 * Tarjeta de un método (Figma 20.27.1): icono destacado de 56, título,
 * descripción, control a la derecha (interruptor o insignia) y sus reglas
 * debajo de un divisor. En móvil (20.27.3) la tarjeta se pliega: se ve el
 * resumen y al tocarla se abren la descripción y las reglas.
 */
import { useId, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/Utils';

export interface TarjetaMetodoProps {
  icono: LucideIcon;
  titulo: string;
  descripcion: string;
  /** Una línea para el móvil plegado («Radio 150 m · desde computador»). */
  resumen: string;
  /** Interruptor o insignia a la derecha del título. */
  control?: ReactNode;
  /** Atenúa el icono: método que todavía no funciona (kiosco, relojes). */
  apagada?: boolean;
  children?: ReactNode;
}

export function TarjetaMetodo({ icono: Icono, titulo, descripcion, resumen, control, apagada = false, children }: TarjetaMetodoProps) {
  const [abierta, setAbierta] = useState(false);
  const id = useId();
  const idCuerpo = `${id}-cuerpo`;
  const idTitulo = `${id}-titulo`;
  const conCuerpo = children !== undefined && children !== null && children !== false;
  return (
    <section aria-labelledby={idTitulo} className="flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-surface p-4 lg:p-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-full lg:size-14',
            apagada ? 'bg-subtle text-fg-muted' : 'bg-brand-tint text-brand'
          )}
        >
          <Icono className="size-6 lg:size-7" strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={idTitulo} className="text-base font-semibold leading-[22px] text-fg">
            {titulo}
          </h3>
          <p className="mt-1 hidden text-[13px] leading-[18px] text-fg-secondary lg:block">{descripcion}</p>
          <button
            type="button"
            className="mt-0.5 flex w-full items-start gap-1 text-left text-[13px] leading-[18px] text-fg-secondary lg:hidden"
            aria-expanded={abierta}
            aria-controls={idCuerpo}
            onClick={() => setAbierta((a) => !a)}
          >
            <span className="min-w-0 flex-1">{resumen}</span>
            <ChevronDown aria-hidden="true" className={cn('mt-px size-4 shrink-0 transition-transform', abierta && 'rotate-180')} strokeWidth={1.5} />
          </button>
        </div>
        {control && <div className="flex shrink-0 items-center">{control}</div>}
      </div>
      <div
        id={idCuerpo}
        className={cn('flex-col gap-3.5', abierta ? 'flex' : 'hidden', conCuerpo ? 'border-t border-line pt-4 lg:flex' : 'lg:hidden')}
      >
        <p className="text-[13px] leading-[18px] text-fg-secondary lg:hidden">{descripcion}</p>
        {children}
      </div>
    </section>
  );
}
