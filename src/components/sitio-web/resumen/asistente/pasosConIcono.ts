/**
 * Icono de cada paso del asistente (A/03): el de la tarea que resuelve, el
 * MISMO que esa tarea tiene en la lista de lanzamiento del Resumen y en el
 * menú (Plantillas, Diseño, Dominios…). Así «Plantilla» se ve igual en el
 * héroe de primera vez, en el asistente y en el Resumen.
 */
import type { LucideIcon } from 'lucide-react';
import type { PasoAsistente } from '@/lib/website/onboardingSitio';
import { ICONO_TAREA_SITIO, type TareaSitio } from '../../ui/iconosSitio';

export const TAREA_DE_PASO_ASISTENTE: Record<PasoAsistente, TareaSitio> = {
  giro: 'giro',
  plantilla: 'plantilla',
  estilo: 'estilo',
  datos: 'logo',
  dominio: 'dominio',
  publicar: 'publicar',
};

export function iconoPasoAsistente(paso: PasoAsistente): LucideIcon {
  return ICONO_TAREA_SITIO[TAREA_DE_PASO_ASISTENTE[paso]];
}
