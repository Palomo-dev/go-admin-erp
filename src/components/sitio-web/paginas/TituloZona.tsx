'use client';

/**
 * Título de una zona de Menú y navegación (A/04c, D/04-09): icono de 16 + texto 16/24 en 600.
 * El icono dice de qué zona se trata (encabezado, pie, categorías, enlace elegido) antes de
 * leerla; es decorativo, el texto dice lo mismo. Los grupos del pie (`nivel` 3) van sin icono:
 * todos serían el mismo y no distinguirían nada (regla de marca 5).
 */
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '@/components/sitio-web/ui/iconosSitio';

export interface TituloZonaProps {
  /** Obligatorio en las columnas (`h2`); los grupos del pie (`h3`) no lo llevan. */
  icono?: LucideIcon;
  children: ReactNode;
  id?: string;
  /** `h2` para las columnas; `h3` para los grupos del pie. */
  nivel?: 2 | 3;
  className?: string;
}

export function TituloZona({ icono: Icono, children, id, nivel = 2, className }: TituloZonaProps) {
  const Etiqueta = nivel === 2 ? 'h2' : 'h3';
  return (
    <Etiqueta
      id={id}
      className={cn(
        'flex min-w-0 items-center gap-2',
        nivel === 2 ? 'text-base font-semibold text-fg' : 'px-2 text-xs font-medium text-fg-secondary',
        className,
      )}
    >
      {Icono && (
        <Icono
          aria-hidden="true"
          className={cn(nivel === 2 ? CLASE_TAMANO_ICONO.base : CLASE_TAMANO_ICONO.meta, 'shrink-0 text-fg-secondary')}
          strokeWidth={TRAZO_ICONO}
        />
      )}
      <span className="truncate">{children}</span>
    </Etiqueta>
  );
}
