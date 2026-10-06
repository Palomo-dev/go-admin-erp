'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/Utils';

/**
 * Fila de ajuste (Figma Sitio web B/12-01: «Mostrar el botón de chat»,
 * «Sitio en construcción», «Idioma del sitio»; Dominios «Renovar
 * automáticamente»): título 14/20 en 500, descripción 13/18 y el control a la
 * derecha (Switch, Select, botón). En móvil < sm el control baja si no cabe.
 *
 * Se agrupan en una lista con borde con `SettingGroup` (filas separadas por
 * una línea, radio 8).
 */
export interface SettingRowProps {
  titulo: ReactNode;
  descripcion?: ReactNode;
  /** El control (Switch, Select, botón). */
  children?: ReactNode;
  /** id del control para enlazar el título como `<label>`. */
  htmlFor?: string;
  /** Rojo para la «Zona de peligro». */
  tono?: 'normal' | 'peligro';
  className?: string;
}

export function SettingRow({ titulo, descripcion, children, htmlFor, tono = 'normal', className }: SettingRowProps) {
  const Titulo = htmlFor ? 'label' : 'p';
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3', className)}>
      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
        <Titulo
          {...(htmlFor ? { htmlFor } : {})}
          className={cn('text-sm font-medium leading-5', tono === 'peligro' ? 'text-danger-text' : 'text-fg')}
        >
          {titulo}
        </Titulo>
        {descripcion ? <div className="text-[13px] leading-[18px] text-fg-secondary">{descripcion}</div> : null}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </div>
  );
}

export interface SettingGroupProps {
  children: ReactNode;
  /** Nombre accesible del grupo. */
  etiqueta?: string;
  className?: string;
}

/** Lista de `SettingRow` con borde y separadores. */
export function SettingGroup({ children, etiqueta, className }: SettingGroupProps) {
  return (
    <div role="group" aria-label={etiqueta} className={cn('divide-y divide-line rounded-lg border border-line bg-surface', className)}>
      {children}
    </div>
  );
}
