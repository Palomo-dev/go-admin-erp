'use client';

import { cn } from '@/utils/Utils';
import { resolverEstado } from '@/components/kit/estadoTono';
import { ESTADO_TONO_PUBLICACION, type EstadoPublicacion } from './estadoPublicacion';
import { FilaSubtitulo } from './SubtituloConIcono';
import { CLASE_ICONO_TONO, CLASE_TAMANO_ICONO, ICONO_ESTADO_PUBLICACION, TRAZO_ICONO, iconoGira, type TamanoIcono } from './iconosSitio';

/**
 * Icono suelto del estado de publicación (el mismo de `PublishStatusBadge`),
 * con el color de su tono: lo llevan los subtítulos de cabecera («Estilo del
 * sitio · 1 cambio sin publicar»). Decorativo: el texto de al lado lo dice.
 * «Guardando…» gira y se detiene con movimiento reducido.
 */
export interface IconoEstadoPublicacionProps {
  estado: EstadoPublicacion;
  tamano?: TamanoIcono;
  className?: string;
}

export function IconoEstadoPublicacion({ estado, tamano = 'meta', className }: IconoEstadoPublicacionProps) {
  const Icono = ICONO_ESTADO_PUBLICACION[estado.tipo];
  return (
    <Icono
      aria-hidden="true"
      data-estado={estado.tipo}
      strokeWidth={TRAZO_ICONO}
      className={cn(
        CLASE_TAMANO_ICONO[tamano],
        'shrink-0',
        CLASE_ICONO_TONO[resolverEstado(ESTADO_TONO_PUBLICACION[estado.tipo]).tono],
        iconoGira(estado.tipo) && 'animate-spin motion-reduce:animate-none',
        className,
      )}
    />
  );
}

/** Subtítulo con el icono del estado delante (14 px), como el del marco del módulo. */
export function SubtituloConEstado({ estado, texto }: { estado: EstadoPublicacion; texto: string }) {
  return <FilaSubtitulo icono={<IconoEstadoPublicacion estado={estado} />} texto={texto} />;
}
