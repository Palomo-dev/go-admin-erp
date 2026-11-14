'use client';

import * as React from 'react';
import { scrollParaMostrar, scrollPorRueda } from './desplazamientoHorizontal';

/** Píxeles que hay que mover el ratón antes de que cuente como arrastre (y no como clic). */
const UMBRAL_ARRASTRE = 5;

/**
 * Barra de pestañas que desplaza en horizontal cuando no cabe:
 *
 * - **Rueda**: el giro vertical mueve la barra en horizontal mientras le
 *   quede recorrido; en el borde, la página sigue con su scroll normal.
 * - **Arrastre con ratón**: arrastrar desplaza; el clic que cierra un
 *   arrastre no activa la pestaña.
 * - **Táctil y trackpad**: nativo (`overflow-x-auto`).
 * - La pestaña activa (`selectorActiva`) se trae a la vista al montar y
 *   cada vez que cambia `claveActiva`, sin mover la página en vertical.
 *
 * Devuelve el `ref` para el contenedor con `overflow-x-auto`.
 */
export function useDesplazamientoHorizontal<T extends HTMLElement>(selectorActiva: string, claveActiva?: unknown) {
  const ref = React.useRef<T | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const alRodar = (e: WheelEvent) => {
      if (e.ctrlKey) return; // zoom del navegador
      const destino = scrollPorRueda(
        { x: e.deltaX, y: e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY },
        { izquierda: el.scrollLeft, ancho: el.scrollWidth, visible: el.clientWidth },
      );
      if (destino === null) return;
      e.preventDefault();
      el.scrollLeft = destino;
    };

    let inicio: { x: number; izquierda: number; id: number } | null = null;
    let arrastrando = false;
    const alBajar = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || el.scrollWidth <= el.clientWidth) return;
      inicio = { x: e.clientX, izquierda: el.scrollLeft, id: e.pointerId };
      arrastrando = false;
    };
    const alMover = (e: PointerEvent) => {
      if (!inicio || e.pointerId !== inicio.id) return;
      const dx = e.clientX - inicio.x;
      if (!arrastrando && Math.abs(dx) < UMBRAL_ARRASTRE) return;
      if (!arrastrando) {
        arrastrando = true;
        el.setPointerCapture?.(e.pointerId);
      }
      el.scrollLeft = inicio.izquierda - dx;
    };
    const alSoltar = (e: PointerEvent) => {
      if (!inicio || e.pointerId !== inicio.id) return;
      if (arrastrando) el.releasePointerCapture?.(e.pointerId);
      inicio = null;
    };
    // El clic que termina un arrastre no navega ni cambia de pestaña.
    const alClic = (e: MouseEvent) => {
      if (!arrastrando) return;
      arrastrando = false;
      e.preventDefault();
      e.stopPropagation();
    };

    el.addEventListener('wheel', alRodar, { passive: false });
    el.addEventListener('pointerdown', alBajar);
    el.addEventListener('pointermove', alMover);
    el.addEventListener('pointerup', alSoltar);
    el.addEventListener('pointercancel', alSoltar);
    el.addEventListener('click', alClic, true);
    return () => {
      el.removeEventListener('wheel', alRodar);
      el.removeEventListener('pointerdown', alBajar);
      el.removeEventListener('pointermove', alMover);
      el.removeEventListener('pointerup', alSoltar);
      el.removeEventListener('pointercancel', alSoltar);
      el.removeEventListener('click', alClic, true);
    };
  }, []);

  React.useEffect(() => {
    const el = ref.current;
    const activa = el?.querySelector<HTMLElement>(selectorActiva);
    if (!el || !activa) return;
    const caja = el.getBoundingClientRect();
    const item = activa.getBoundingClientRect();
    const destino = scrollParaMostrar(
      { izquierda: item.left - caja.left + el.scrollLeft, ancho: item.width },
      { izquierda: el.scrollLeft, ancho: el.scrollWidth, visible: el.clientWidth },
    );
    if (destino !== null) el.scrollLeft = destino;
  }, [selectorActiva, claveActiva]);

  return ref;
}
