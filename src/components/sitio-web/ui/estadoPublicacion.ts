/**
 * Estado de publicación del sitio (Figma A/07a): una sola regla para el
 * Resumen, Diseño, Páginas, Configuración y la barra del editor. Puro.
 *
 * Lo alimenta `useSitioV2` (borrador vs. revisión publicada de la API V2);
 * `is_published` de `website_settings` no sirve (está en true en todas las
 * filas y no dice nada).
 */

export type EstadoPublicacion =
  | { tipo: 'publicado' }
  | { tipo: 'cambios'; cantidad: number }
  | { tipo: 'borrador' }
  | { tipo: 'guardando' }
  | { tipo: 'programado'; fecha: string | Date }
  | { tipo: 'sin_publicar' }
  | { tipo: 'error' };

export interface DatosPublicacion {
  /** Instante de la última publicación (`null` = nunca se publicó). */
  publicadoEn?: string | Date | null;
  /** Cambios del borrador que la revisión publicada aún no tiene. */
  cambiosSinPublicar?: number;
  /** Hay un guardado en curso. */
  guardando?: boolean;
  /** Publicación programada pendiente. */
  programadoPara?: string | Date | null;
  /** La última publicación falló. */
  falloPublicacion?: boolean;
}

/**
 * Prioridad: guardando → falló → programado → nunca publicado → cambios →
 * publicado. «Guardado en borrador» no sale de aquí: es el estado de un cambio
 * concreto (Cambios recientes), no del sitio.
 */
export function resolverEstadoPublicacion(d: DatosPublicacion): EstadoPublicacion {
  if (d.guardando) return { tipo: 'guardando' };
  if (d.falloPublicacion) return { tipo: 'error' };
  if (d.programadoPara) return { tipo: 'programado', fecha: d.programadoPara };
  if (!d.publicadoEn) return { tipo: 'sin_publicar' };
  const n = Math.max(0, Math.floor(d.cambiosSinPublicar ?? 0));
  if (n > 0) return { tipo: 'cambios', cantidad: n };
  return { tipo: 'publicado' };
}

/** Clave de la tabla única de tonos (`kit/estadoTono.ts`) para cada estado. */
export const ESTADO_TONO_PUBLICACION: Record<EstadoPublicacion['tipo'], string> = {
  publicado: 'publicado',
  cambios: 'cambios sin publicar',
  borrador: 'guardado en borrador',
  guardando: 'guardando',
  programado: 'programado',
  sin_publicar: 'sin publicar',
  error: 'no se pudo publicar',
};
