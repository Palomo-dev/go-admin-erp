'use client';

/**
 * Piezas compartidas por las secciones de «Mi perfil»: la clase del campo de
 * texto (Figma `FormField`, 40 px, borde fuerte) y la fila de ajuste de
 * Seguridad (346:19975): título con insignia, descripción y acciones. En
 * móvil (348:12765) cada fila es una tarjeta y su acción ocupa el ancho con
 * 48 px de alto.
 */
import type { ReactNode } from 'react';
import { cn } from '@/utils/Utils';

export const CLASE_CAMPO =
  'h-10 w-full min-w-0 rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg outline-none placeholder:text-fg-muted ' +
  'focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:bg-subtle disabled:text-fg-secondary';

export function FilaAjuste({
  titulo,
  insignia,
  descripcion,
  acciones,
  className,
}: {
  titulo: string;
  insignia?: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-line bg-surface p-4',
        'sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:rounded-none sm:border-0 sm:border-b sm:bg-transparent sm:px-0 sm:py-4 sm:last:border-b-0',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-medium leading-5 text-fg">{titulo}</h3>
          {insignia}
        </div>
        {descripcion && <div className="text-[13px] leading-[18px] text-fg-secondary">{descripcion}</div>}
      </div>
      {acciones && (
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center [&>*]:h-12 [&>*]:w-full sm:[&>*]:h-10 sm:[&>*]:w-auto">
          {acciones}
        </div>
      )}
    </div>
  );
}
