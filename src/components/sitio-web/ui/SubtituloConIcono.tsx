'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { TonoBadge } from '@/components/kit/estadoTono';
import { CLASE_ICONO_TONO, CLASE_TAMANO_ICONO, TRAZO_ICONO } from './iconosSitio';

/**
 * Subtítulo de cabecera con un icono de 14 px delante (13/18, trazo 1,5). Es la
 * fila que comparten `SubtituloConEstado` (estado de publicación) y los
 * subtítulos que no son un estado, como el de Plantillas («Usar una plantilla
 * crea un borrador: tu contenido se conserva», A/06b). El icono es decorativo:
 * el texto lo dice; su color sale del tono, nunca de un hex.
 */
export function FilaSubtitulo({ icono, texto }: { icono: ReactNode; texto: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {icono}
      <span className="min-w-0 truncate">{texto}</span>
    </span>
  );
}

export interface SubtituloConIconoProps {
  /** De `iconosSitio.ts`: ninguna pantalla elige su icono por su cuenta. */
  icono: LucideIcon;
  texto: string;
  /** Tono del icono (por defecto, marca). */
  tono?: TonoBadge;
}

export function SubtituloConIcono({ icono: Icono, texto, tono = 'marca' }: SubtituloConIconoProps) {
  return (
    <FilaSubtitulo
      texto={texto}
      icono={
        <Icono
          aria-hidden="true"
          strokeWidth={TRAZO_ICONO}
          className={cn(CLASE_TAMANO_ICONO.meta, 'shrink-0', CLASE_ICONO_TONO[tono])}
        />
      }
    />
  );
}
