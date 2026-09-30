/**
 * Lógica de `CargarMas` (Figma 759:444795): paginación por cursor de la línea
 * de tiempo y de las listas móviles, con el total exacto. Sin React.
 */
export type EstadoCargarMas = 'listo' | 'cargando' | 'fin' | 'error';
export type EntidadCargarMas = 'actividades' | 'oportunidades' | 'leads' | 'clientes';

export function estadoCargarMas(opciones: {
  mostrados: number;
  total: number | null | undefined;
  /** Del cursor: el servidor dice si hay otra página (manda sobre el total). */
  hayMas?: boolean;
  cargando?: boolean;
  error?: string | null;
}): EstadoCargarMas {
  if (opciones.cargando) return 'cargando';
  if (opciones.error) return 'error';
  if (typeof opciones.hayMas === 'boolean') return opciones.hayMas ? 'listo' : 'fin';
  const total = opciones.total ?? 0;
  return opciones.mostrados < total ? 'listo' : 'fin';
}

/** Cuántos trae el siguiente lote: el tamaño de página o lo que falte. */
export function siguienteLote(mostrados: number, total: number | null | undefined, tamanoPagina: number): number {
  if (typeof total !== 'number' || !Number.isFinite(total)) return tamanoPagina;
  return Math.max(0, Math.min(tamanoPagina, total - mostrados));
}
