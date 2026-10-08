'use client';

/**
 * Al llegar por un deep link con ajuste (`#desinteres` o `?ajuste=desinteres`),
 * baja hasta ese ajuste, le da el foco y lo resalta 2 s (`data-resaltado`, que
 * pinta un anillo de marca; sin desplazamiento suave con «reducir movimiento»).
 *
 * La sección puede tardar en pintar el ajuste (carga perezosa, datos del
 * servidor): se reintenta hasta `ESPERA_MAXIMA_MS`.
 */
import { useEffect } from 'react';

export const DURACION_RESALTADO_MS = 2000;
const ESPERA_MAXIMA_MS = 4000;
const INTERVALO_MS = 100;

function prefiereMenosMovimiento(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Margen sobre el ajuste al bajar: deja a la vista el aviso fijo «se movió aquí». */
const MARGEN_SUPERIOR_PX = 96;

/** El contenedor con scroll más cercano (el `<main>` de Configuración), si lo hay. */
function contenedorConScroll(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = window.getComputedStyle(p).overflowY;
    if ((y === 'auto' || y === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/** Resalta el elemento con id `ancla` dentro del documento. Devuelve si lo encontró. */
export function resaltarAncla(ancla: string): boolean {
  const el = document.getElementById(ancla);
  if (!el) return false;
  const behavior: ScrollBehavior = prefiereMenosMovimiento() ? 'auto' : 'smooth';
  // Se baja solo dentro de Configuración: `scrollIntoView` movería también el
  // marco de la app y sacaría de la vista la cabecera y el aviso.
  const contenedor = contenedorConScroll(el);
  if (contenedor) {
    const top = el.getBoundingClientRect().top - contenedor.getBoundingClientRect().top + contenedor.scrollTop - MARGEN_SUPERIOR_PX;
    contenedor.scrollTo({ top: Math.max(0, top), behavior });
  } else {
    el.scrollIntoView({ block: 'start', behavior });
  }
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
  el.setAttribute('data-resaltado', 'true');
  window.setTimeout(() => el.removeAttribute('data-resaltado'), DURACION_RESALTADO_MS);
  return true;
}

export function useResaltarAncla(ancla: string | null, clave: string | undefined): void {
  useEffect(() => {
    if (!ancla) return;
    let restante = ESPERA_MAXIMA_MS;
    if (resaltarAncla(ancla)) return;
    const id = window.setInterval(() => {
      restante -= INTERVALO_MS;
      if (resaltarAncla(ancla) || restante <= 0) window.clearInterval(id);
    }, INTERVALO_MS);
    return () => window.clearInterval(id);
  }, [ancla, clave]);
}
