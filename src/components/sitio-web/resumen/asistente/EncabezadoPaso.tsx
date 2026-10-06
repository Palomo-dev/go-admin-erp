'use client';

/**
 * Título de un paso del asistente (A/03a-03f): caja de 40 px con el icono de
 * la tarea, H2 22/28 y la explicación 14/20. Uno solo para los seis pasos, para
 * que el icono, el tamaño y el espacio no cambien de un paso a otro.
 */
import type { ReactNode } from 'react';
import type { PasoAsistente } from '@/lib/website/onboardingSitio';
import { CajaIcono } from '../../ui/CajaIcono';
import { iconoPasoAsistente } from './pasosConIcono';

export interface EncabezadoPasoProps {
  paso: PasoAsistente;
  titulo: string;
  descripcion: ReactNode;
}

export function EncabezadoPaso({ paso, titulo, descripcion }: EncabezadoPasoProps) {
  return (
    <div className="flex items-start gap-3 lg:gap-4" data-paso={paso}>
      <CajaIcono icono={iconoPasoAsistente(paso)} tamano="md" />
      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="text-[22px] font-semibold leading-7 text-fg">{titulo}</h2>
        <p className="text-sm leading-5 text-fg-secondary">{descripcion}</p>
      </div>
    </div>
  );
}
