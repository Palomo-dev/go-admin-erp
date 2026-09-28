'use client';

import { useId, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { clasesTonoTarjeta, type TonoTarjeta } from './tonosKit';

/**
 * Tarjeta de un detalle (Figma `Tarjeta` 680:406329): icono tintado de 32,
 * título, acción a la derecha y contenido. Es el bloque de «Información de la
 * sesión», «Pagos aplicados», «Proveedor y documento», «Resumen»…
 *
 * Sustituye a las tarjetas privadas de cada detalle. `tono` marca un aviso
 * (venta anulada con NC en peligro); `sinRelleno` deja el contenido pegado a
 * los bordes para una tabla compacta.
 */
export { clasesTonoTarjeta, type TonoTarjeta };

export interface TarjetaProps {
  titulo?: string;
  descripcion?: ReactNode;
  icono?: LucideIcon;
  /** Botón o menú a la derecha del título («Ver todos», «⋯»). */
  accion?: ReactNode;
  tono?: TonoTarjeta;
  /** Contenido sin relleno lateral (tablas). */
  sinRelleno?: boolean;
  /** Fila inferior separada (totales, enlace «Ver más»). */
  pie?: ReactNode;
  children?: ReactNode;
  id?: string;
  className?: string;
}

export function Tarjeta({ titulo, descripcion, icono: Icono, accion, tono = 'neutro', sinRelleno, pie, children, id, className }: TarjetaProps) {
  const generado = useId();
  const idTitulo = `${id ?? `tarjeta-${generado}`}-titulo`;
  const clases = clasesTonoTarjeta(tono);
  const conCabecera = !!(titulo || accion);
  return (
    <section
      id={id}
      aria-labelledby={titulo ? idTitulo : undefined}
      className={cn('flex flex-col rounded-xl border bg-surface', clases.borde, className)}
    >
      {conCabecera && (
        <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            {Icono && (
              <span aria-hidden="true" className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', clases.icono)}>
                <Icono className="size-4" strokeWidth={1.5} />
              </span>
            )}
            <div className="min-w-0">
              {titulo && (
                <h2 id={idTitulo} className="truncate text-base font-semibold leading-6 text-fg">
                  {titulo}
                </h2>
              )}
              {descripcion && <p className="text-[13px] leading-[18px] text-fg-secondary">{descripcion}</p>}
            </div>
          </div>
          {accion && <div className="flex shrink-0 items-center gap-2">{accion}</div>}
        </div>
      )}
      {children !== undefined && children !== null && (
        <div className={cn('flex min-w-0 flex-1 flex-col', sinRelleno ? 'pt-3' : 'px-4 pb-4 pt-3 sm:px-5', !conCabecera && !sinRelleno && 'pt-4')}>
          {children}
        </div>
      )}
      {pie && <div className="border-t border-line px-4 py-3 sm:px-5">{pie}</div>}
    </section>
  );
}
