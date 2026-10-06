'use client';

import { useCallback } from 'react';
import { StatusBadge } from '@/components/kit';
import { resolverEstado } from '@/components/kit/estadoTono';
import { clasesBadgeTono } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { ESTADO_TONO_PUBLICACION, type EstadoPublicacion } from './estadoPublicacion';
import { useTextosComun } from './textos';
import { ICONO_ESTADO_PUBLICACION, iconoGira } from './iconosSitio';

/**
 * Estado de publicación del sitio (Figma A/07a): Publicado · N cambios sin
 * publicar · Guardado en borrador · Guardando… · Programado · 8 oct., 7:00 a. m.
 * · Sin publicar · No se pudo publicar. Píldora con punto; el tono sale de
 * `estadoTono.ts`. La fecha programada va en la zona de la organización.
 *
 * Indicador: por defecto un ICONO por estado (`ICONO_ESTADO_PUBLICACION`:
 * check, nube con flecha, lápiz, reloj de calendario, ojo tachado,
 * triángulo), porque el dueño pidió que el estado se entienda sin leer. El
 * punto de 6 px de la captura queda como `indicador="punto"` para listas muy
 * densas. «Guardando…» gira y se detiene con movimiento reducido.
 */
export interface PublishStatusBadgeProps {
  estado: EstadoPublicacion;
  /** `sm` 22 px en listas; `md` 24 px en cabeceras y tarjetas. */
  tamano?: 'sm' | 'md';
  /** `icono` (por defecto) o `punto` (la píldora con punto de A/07a). */
  indicador?: 'icono' | 'punto';
  className?: string;
}

/** Texto del estado en el idioma activo (lo usan la píldora y el subtítulo del marco). */
export function useEtiquetaPublicacion(): (estado: EstadoPublicacion) => string {
  const tx = useTextosComun();
  const locale = useLocaleIntl();
  // `null`: el sitio es de toda la organización, no de la sucursal del header.
  const { timezone } = useFormatDate(null);
  return useCallback(
    (estado: EstadoPublicacion) => {
      switch (estado.tipo) {
        case 'publicado':
          return tx('publicacion.publicado');
        case 'cambios':
          return estado.cantidad === 1 ? tx('publicacion.cambiosUno') : tx('publicacion.cambios', { n: estado.cantidad });
        case 'borrador':
          return tx('publicacion.borrador');
        case 'guardando':
          return tx('publicacion.guardando');
        case 'programado':
          return tx('publicacion.programado', {
            fecha: formatDateInTz(estado.fecha, timezone, {
              locale,
              day: 'numeric',
              month: 'short',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            }),
          });
        case 'sin_publicar':
          return tx('publicacion.sinPublicar');
        default:
          return tx('publicacion.error');
      }
    },
    [tx, locale, timezone],
  );
}

export function PublishStatusBadge({ estado, tamano = 'md', indicador = 'icono', className }: PublishStatusBadgeProps) {
  const etiqueta = useEtiquetaPublicacion()(estado);
  const claveTono = ESTADO_TONO_PUBLICACION[estado.tipo];
  if (indicador === 'punto') {
    return (
      <span role="status" aria-live="polite" className="inline-flex">
        <StatusBadge estado={claveTono} etiqueta={etiqueta} tamano={tamano} className={className} />
      </span>
    );
  }
  const { tono, apariencia } = resolverEstado(claveTono);
  const Icono = ICONO_ESTADO_PUBLICACION[estado.tipo];
  return (
    <span role="status" aria-live="polite" className="inline-flex">
      <span data-estado={estado.tipo} className={cn(clasesBadgeTono(tono, apariencia, tamano), className)}>
        <Icono
          aria-hidden="true"
          strokeWidth={2}
          className={cn(
            tamano === 'sm' ? 'size-3' : 'size-3.5',
            'shrink-0',
            iconoGira(estado.tipo) && 'animate-spin motion-reduce:animate-none',
          )}
        />
        <span className="truncate">{etiqueta}</span>
      </span>
    </span>
  );
}
