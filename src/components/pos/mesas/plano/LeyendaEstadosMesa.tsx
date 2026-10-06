'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { CLASES_ESTADO, ORDEN_ESTADOS, type EstadoMesaPlano } from './estadoMesaPlano';

/**
 * Leyenda de estados que también filtra (Figma `LeyendaEstadosMesa`, 870:98618):
 * «Libres · 21  Ocupadas · 24  Por cobrar · 6  Reservadas · 4  Por limpiar · 5».
 * Cada estado es un interruptor; varios a la vez se suman («Estado: Ocupada, Por cobrar»).
 */
export interface LeyendaEstadosMesaProps {
  conteos: Record<EstadoMesaPlano, number>;
  seleccion: readonly EstadoMesaPlano[];
  onSeleccionChange: (estados: EstadoMesaPlano[]) => void;
  className?: string;
}

export function LeyendaEstadosMesa({ conteos, seleccion, onSeleccionChange, className }: LeyendaEstadosMesaProps) {
  const t = useTranslations('posMesasPlano.leyenda');
  const alternar = (e: EstadoMesaPlano) =>
    onSeleccionChange(seleccion.includes(e) ? seleccion.filter((x) => x !== e) : ORDEN_ESTADOS.filter((x) => x === e || seleccion.includes(x)));

  return (
    <div
      role="group"
      aria-label={t('etiqueta')}
      className={cn('flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1 [scrollbar-width:none]', className)}
    >
      {ORDEN_ESTADOS.map((e) => {
        const activo = seleccion.includes(e);
        return (
          <button
            key={e}
            type="button"
            aria-pressed={activo}
            onClick={() => alternar(e)}
            className={cn(
              'inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[13px] text-fg-secondary transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              activo && 'bg-subtle font-medium text-fg',
            )}
          >
            <span aria-hidden="true" className={cn('size-3 rounded-[3px] border', CLASES_ESTADO[e].punto)} />
            {t(e, { n: conteos[e] })}
          </button>
        );
      })}
    </div>
  );
}
