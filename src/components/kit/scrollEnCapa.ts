import type { TouchEvent, WheelEvent } from 'react';

/**
 * Props para el contenido de un panel flotante (popover) en portal que tenga
 * listas desplazables.
 *
 * Dentro de un diálogo de Radix, su bloqueo de scroll (react-remove-scroll)
 * escucha la rueda y el toque en `document` y llama `preventDefault()` para todo
 * lo que esté fuera del diálogo. Un popover en portal queda fuera, así que su
 * lista no se movía con el mouse (caso real: «Empieza» de «Agendar reunión»).
 *
 * Cortar la propagación no sirve aquí: en el App Router la raíz de React ES
 * `document`, el mismo nodo donde escucha el bloqueo. Así que, cuando el evento
 * termina anulado, el panel desplaza a mano el contenedor desplazable más
 * cercano. Se comprueba en una tarea (`setTimeout`), no en una microtarea: las
 * microtareas corren entre oyente y oyente del mismo evento, antes de que el
 * bloqueo lo anule (verificado en Chromium).
 * Sin diálogo nadie anula el evento y el navegador desplaza como siempre (no se
 * desplaza dos veces).
 */

const PIXELES_POR_LINEA = 16;

function contenedorDesplazable(desde: EventTarget | null, limite: HTMLElement): HTMLElement | null {
  let nodo = desde instanceof HTMLElement ? desde : null;
  while (nodo && limite.contains(nodo)) {
    const estilo = window.getComputedStyle(nodo);
    if (/(auto|scroll)/.test(estilo.overflowY) && nodo.scrollHeight > nodo.clientHeight) return nodo;
    if (nodo === limite) break;
    nodo = nodo.parentElement;
  }
  return null;
}

function alAnularse(evento: Event, accion: () => void) {
  setTimeout(() => {
    if (evento.defaultPrevented) accion();
  }, 0);
}

function rueda(e: WheelEvent) {
  const caja = contenedorDesplazable(e.target, e.currentTarget as HTMLElement);
  if (!caja) return;
  const delta = e.deltaMode === 1 ? e.deltaY * PIXELES_POR_LINEA : e.deltaY;
  alAnularse(e.nativeEvent, () => {
    caja.scrollTop += delta;
  });
}

const toque = new WeakMap<HTMLElement, number>();

function inicioToque(e: TouchEvent) {
  const caja = contenedorDesplazable(e.target, e.currentTarget as HTMLElement);
  if (caja) toque.set(caja, e.touches[0]?.clientY ?? 0);
}

function movimientoToque(e: TouchEvent) {
  const caja = contenedorDesplazable(e.target, e.currentTarget as HTMLElement);
  if (!caja) return;
  const y = e.touches[0]?.clientY ?? 0;
  const anterior = toque.get(caja) ?? y;
  toque.set(caja, y);
  alAnularse(e.nativeEvent, () => {
    caja.scrollTop += anterior - y;
  });
}

export const PROPS_SCROLL_EN_CAPA = { onWheel: rueda, onTouchStart: inicioToque, onTouchMove: movimientoToque } as const;
