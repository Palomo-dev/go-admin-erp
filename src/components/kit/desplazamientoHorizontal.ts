/**
 * Reglas puras del desplazamiento horizontal de las barras de pestañas
 * (`TabBar`, `PestanasEnlace`, pestañas del Chat). La barra esconde su
 * barra de desplazamiento, así que con ratón hace falta traducir la rueda
 * vertical a horizontal; con el dedo el navegador ya desplaza solo.
 */

export interface MedidasScroll {
  /** `scrollLeft` actual. */
  izquierda: number;
  /** `scrollWidth`. */
  ancho: number;
  /** `clientWidth`. */
  visible: number;
}

/**
 * Nuevo `scrollLeft` para un giro de la rueda, o `null` si la barra no debe
 * quedarse el evento (no desborda, el gesto ya es horizontal o llegó al
 * borde en esa dirección: entonces la página sigue desplazándose en vertical).
 */
export function scrollPorRueda(delta: { x: number; y: number }, m: MedidasScroll): number | null {
  const maximo = Math.max(0, m.ancho - m.visible);
  if (maximo <= 1) return null;
  if (Math.abs(delta.x) >= Math.abs(delta.y) || delta.y === 0) return null;
  const destino = Math.min(maximo, Math.max(0, m.izquierda + delta.y));
  return Math.abs(destino - m.izquierda) < 0.5 ? null : destino;
}

/**
 * `scrollLeft` que deja a la vista un elemento (la pestaña activa) con un
 * margen, o `null` si ya se ve entero.
 */
export function scrollParaMostrar(item: { izquierda: number; ancho: number }, m: MedidasScroll, margen = 16): number | null {
  const maximo = Math.max(0, m.ancho - m.visible);
  if (item.izquierda < m.izquierda) return Math.max(0, item.izquierda - margen);
  const derecha = item.izquierda + item.ancho;
  if (derecha > m.izquierda + m.visible) return Math.min(maximo, derecha - m.visible + margen);
  return null;
}
