'use client';

/**
 * Casilla accionable del bloque «Hoy» (Figma `TarjetaHoy` 445:195385, en
 * `03 Navegación y shell` › «Componentes — Inicio (Nuevo)»).
 *
 * Etiqueta + estado, cifra, detalle y UNA sola acción. El acento de 4 px a la
 * izquierda lleva el tono (éxito · peligro · advertencia · neutro). El detalle
 * va en pizarra y no en el gris decorativo del frame: el manual reserva
 * `text/muted` para lo no textual (contraste 2,6:1).
 */
import Link from 'next/link';
import { cn } from '@/utils/Utils';
import { StatusBadge } from '@/components/kit/StatusBadge';
import type { TonoHoy } from '@/lib/dashboard/bloqueHoy';

const ACENTO: Record<TonoHoy, string> = {
  exito: 'bg-success',
  peligro: 'bg-danger',
  advertencia: 'bg-warning',
  neutro: 'bg-line-strong',
};

export interface TarjetaHoyProps {
  tono: TonoHoy;
  etiqueta: string;
  estado: string;
  cifra: string;
  detalle: string;
  accion: { etiqueta: string; href: string };
  className?: string;
}

export function TarjetaHoy({ tono, etiqueta, estado, cifra, detalle, accion, className }: TarjetaHoyProps) {
  return (
    <article
      data-tono={tono}
      className={cn('relative flex min-h-[152px] min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface', className)}
    >
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', ACENTO[tono])} />
      <div className="flex flex-1 flex-col gap-1.5 pb-2 pl-4 pr-3 pt-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-xs font-medium leading-4 text-fg-secondary">{etiqueta}</h3>
          <StatusBadge
            estado={estado}
            etiqueta={estado}
            tono={tono === 'exito' ? 'exito' : tono}
            apariencia={tono === 'peligro' ? 'solido' : 'suave'}
            className="shrink-0"
          />
        </div>
        <p className="text-[22px] font-semibold leading-7 tracking-[-0.2px] text-fg tabular-nums">{cifra}</p>
        <p className="text-xs leading-[18px] text-fg-secondary">{detalle}</p>
        <div className="flex-1" />
        <Link
          href={accion.href}
          className="-ml-3 inline-flex h-8 w-fit items-center rounded-lg px-3 text-xs font-medium text-fg outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
        >
          {accion.etiqueta}
          <span className="sr-only">: {etiqueta}</span>
        </Link>
      </div>
    </article>
  );
}
