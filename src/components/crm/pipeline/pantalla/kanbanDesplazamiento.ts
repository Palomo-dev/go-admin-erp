/**
 * Desplazamiento horizontal del kanban. Sin React.
 *
 * El tablero es más ancho que la pantalla (la plantilla de ventas tiene 9
 * etapas). Mantener el clic y mover el lienzo lo corre. Al arrastrar una
 * tarjeta cerca del borde, el mismo lienzo avanza para poder soltarla en
 * una etapa que todavía no se ve.
 */

export const MARGEN_AVANCE = 72;
export const PASO_AVANCE = 18;

/** -1 hacia la izquierda, 1 hacia la derecha, 0 si el puntero no está en el borde. */
export function sentidoAvance(x: number, izquierda: number, derecha: number, margen = MARGEN_AVANCE): -1 | 0 | 1 {
  if (derecha - izquierda <= margen * 2) return 0;
  if (x <= izquierda + margen) return -1;
  if (x >= derecha - margen) return 1;
  return 0;
}

/** Nuevo `scrollLeft` al arrastrar el lienzo desde `origenX` hasta `x`. */
export function scrollTrasArrastre(inicio: number, origenX: number, x: number): number {
  return inicio - (x - origenX);
}

/** El clic nace en una tarjeta o en un control: no debe correr el lienzo. */
export function esZonaDeTarjeta(el: Element | null): boolean {
  return !!el?.closest('[data-kanban-tarjeta], button, a, input, textarea, select, [role="menuitem"]');
}

/** El clic nace en un control de la tarjeta: no empieza el arrastre de la oportunidad. */
export function esControlDeTarjeta(el: Element | null): boolean {
  return !!el?.closest('button, a, input, textarea, select, [role="menuitem"]');
}

/**
 * El puntero está sobre la barra horizontal del lienzo. Ese gesto lo resuelve
 * el navegador; si lo capturamos, la barra deja de correr.
 */
export function esBarraHorizontal(el: HTMLElement, clientY: number): boolean {
  const barra = el.offsetHeight - el.clientHeight;
  if (barra <= 0) return false;
  return clientY >= el.getBoundingClientRect().bottom - barra - 1;
}

/**
 * Hacia dónde quedan etapas fuera de la vista. Sin desborde no hay nada que
 * agarrar: el lienzo no muestra la mano ni se deja arrastrar.
 */
export function bordesOcultos(scrollLeft: number, scrollWidth: number, clientWidth: number): { izquierda: boolean; derecha: boolean } {
  const holgura = 1;
  return { izquierda: scrollLeft > holgura, derecha: scrollLeft + clientWidth < scrollWidth - holgura };
}
