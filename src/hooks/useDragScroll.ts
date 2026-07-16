import { useRef } from 'react';

/**
 * Permite arrastrar con click/touch para desplazar horizontalmente un
 * contenedor con overflow (ej. barras de filtros/categorías con scroll).
 * Evita que el arrastre dispare el click del elemento subyacente.
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const state = useRef({ isDown: false, startX: 0, scrollLeft: 0, moved: false, pointerId: 0 });

  const onPointerDown = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    state.current.isDown = true;
    state.current.moved = false;
    state.current.startX = e.clientX;
    state.current.scrollLeft = el.scrollLeft;
    state.current.pointerId = e.pointerId;
    // No se captura el puntero aquí: si se hace en pointerdown, el evento "click"
    // resultante se redirige al contenedor en vez del botón interno, bloqueando
    // el filtro. Solo se captura una vez confirmado un arrastre real (ver abajo).
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || !state.current.isDown) return;
    const dx = e.clientX - state.current.startX;
    if (Math.abs(dx) > 5 && !state.current.moved) {
      state.current.moved = true;
      try {
        el.setPointerCapture(state.current.pointerId);
      } catch {
        // ignorar si el puntero ya no está disponible
      }
    }
    if (state.current.moved) {
      el.scrollLeft = state.current.scrollLeft - dx;
    }
  };

  const onPointerUp = () => {
    state.current.isDown = false;
  };

  const onClickCapture = (e: React.MouseEvent) => {
    if (state.current.moved) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return { ref, onPointerDown, onPointerMove, onPointerUp, onPointerLeave: onPointerUp, onClickCapture };
}
