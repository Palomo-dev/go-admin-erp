/**
 * Desplazamiento a un elemento SOLO dentro de su contenedor con scroll.
 *
 * `element.scrollIntoView()` desplaza TODOS los ancestros, también los que
 * tienen `overflow: hidden`. En el layout de la app el scroll vive en el
 * `<main>` y la raíz no se desplaza; cuando la sección destino está al final
 * (no alcanza a subir hasta arriba del `<main>`), el navegador completa el
 * recorrido moviendo la raíz: el header desaparece, abajo queda un espacio en
 * blanco y el usuario no puede volver porque ese ancestro no tiene barra.
 * Pasaba en el formulario de producto con «Códigos», «Organización y
 * proveedor» y «Avanzado» (2026-09-28).
 *
 * Aquí se calcula la posición y se desplaza únicamente el ancestro que de
 * verdad tiene scroll (o la ventana si no hay ninguno), respetando
 * `scroll-margin-top` y sin pasar del máximo.
 */

function tieneScrollVertical(el: HTMLElement): boolean {
  const { overflowY } = getComputedStyle(el);
  return (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && el.scrollHeight > el.clientHeight;
}

/** Ancestro más cercano con scroll vertical propio, o null (la ventana). */
export function contenedorConScroll(el: HTMLElement): HTMLElement | null {
  let actual = el.parentElement;
  while (actual && actual !== document.body && actual !== document.documentElement) {
    if (tieneScrollVertical(actual)) return actual;
    actual = actual.parentElement;
  }
  return null;
}

export interface OpcionesDesplazamiento {
  behavior?: ScrollBehavior;
  /** `start` (por defecto) alinea arriba; `center` centra el elemento. */
  block?: 'start' | 'center';
}

export function desplazarA(el: HTMLElement | null | undefined, opciones: OpcionesDesplazamiento = {}): void {
  if (!el) return;
  const { behavior = 'smooth', block = 'start' } = opciones;
  const margen = Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  const rect = el.getBoundingClientRect();
  const contenedor = contenedorConScroll(el);

  if (contenedor) {
    const base = contenedor.getBoundingClientRect();
    let destino = rect.top - base.top + contenedor.scrollTop - margen;
    if (block === 'center') destino -= (contenedor.clientHeight - rect.height) / 2;
    const maximo = contenedor.scrollHeight - contenedor.clientHeight;
    contenedor.scrollTo({ top: Math.max(0, Math.min(destino, maximo)), behavior });
    return;
  }

  let destino = rect.top + window.scrollY - margen;
  if (block === 'center') destino -= (window.innerHeight - rect.height) / 2;
  window.scrollTo({ top: Math.max(0, destino), behavior });
}
