/**
 * Visibilidad de una sección por dispositivo (Figma «figma-estilo» 08
 * DeviceToggle, 09 DeviceVisibilityChip y 10 SortableRow oculta en dispositivo).
 *
 * El documento V2 guarda `visibilidad: { escritorio, movil, tableta? }`; si falta
 * `tableta`, sigue al computador (`desdeVisibilidadDocumento`). Puro, sin React.
 */

// Una sola definición: la de `src/lib/website/v2/estiloSeccion.ts`, que es la que lee y
// escribe el documento. Aquí solo se reexporta con los nombres que usan los componentes.
import {
  DISPOSITIVOS,
  visibilidadDesdeDocumento,
  type Dispositivo,
  type Visibilidad,
} from '@/lib/website/v2/estiloSeccion';

export const DISPOSITIVOS_SITIO = DISPOSITIVOS;
export type DispositivoSitio = Dispositivo;

export type VisibilidadDispositivos = Visibilidad;

/** Resumen para el chip: nada si se ve en todos. */
export type ResumenVisibilidad =
  | { tipo: 'todos' }
  | { tipo: 'oculta'; dispositivo: DispositivoSitio }
  | { tipo: 'solo'; dispositivo: DispositivoSitio }
  | { tipo: 'ninguno' };

export function resumirVisibilidad(v: VisibilidadDispositivos): ResumenVisibilidad {
  const visibles = DISPOSITIVOS_SITIO.filter((d) => v[d]);
  if (visibles.length === DISPOSITIVOS_SITIO.length) return { tipo: 'todos' };
  if (visibles.length === 0) return { tipo: 'ninguno' };
  if (visibles.length === 1) return { tipo: 'solo', dispositivo: visibles[0] };
  const oculto = DISPOSITIVOS_SITIO.find((d) => !v[d]) as DispositivoSitio;
  return { tipo: 'oculta', dispositivo: oculto };
}

/** Lee la visibilidad del documento V2 (`tableta` opcional: sigue al computador). */
export const desdeVisibilidadDocumento = visibilidadDesdeDocumento;

/**
 * ¿El sitio público (goadmin-websites) ya respeta `visibilidad.tableta`? Hoy NO: solo lee
 * `escritorio` y `movil`. Mientras sea `false`, el interruptor de tableta queda deshabilitado
 * con una nota y sigue al de computador (`conTabletaSegunContrato`), para que nadie oculte
 * algo en tableta que en producción se sigue viendo. Se pasa a `true` cuando el contrato
 * esté desplegado en goadmin-websites.
 */
export const TABLETA_EN_SITIO_PUBLICO = false;

/** Si el sitio público aún no lee la tableta, la tableta sigue al computador. */
export function conTabletaSegunContrato(v: VisibilidadDispositivos, disponible: boolean = TABLETA_EN_SITIO_PUBLICO): VisibilidadDispositivos {
  return disponible ? v : { ...v, tableta: v.computador };
}
