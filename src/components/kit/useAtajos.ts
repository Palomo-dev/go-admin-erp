'use client';

import { useEffect, useRef } from 'react';
import { atajoValidoEnCampo, claveAtajo, claveDeEvento, type EventoTecla } from './teclas';

/**
 * Registro de atajos de una pantalla (POS, cobro, post-venta): un solo
 * `keydown` por ámbito y la misma lista alimenta el mapa de atajos (F1).
 *
 * Reglas (POS-PLAN §3.3):
 * - Con el foco en un campo de texto solo valen F1–F12, Esc y las
 *   combinaciones con Alt/Ctrl/⌘ (salvo `permitirEnCampo`).
 * - Mientras el lector de códigos tiene una ráfaga pendiente (`hayRafaga`),
 *   no se dispara nada: 13 dígitos + Enter son un escaneo, no atajos.
 * - `cuando` desactiva un atajo según el estado (sin caja, sin líneas).
 */
export interface Atajo {
  /** Como se escribe en pantalla: «F9», «Ctrl+N», «Alt+1», «Supr». */
  tecla: string;
  accion: () => void;
  /** Qué hace, para el mapa de atajos (ya traducido). */
  descripcion: string;
  /** Grupo del mapa de atajos («Venta», «Cobro»). */
  grupo?: string;
  /** Si devuelve false, el atajo no aplica ahora. */
  cuando?: () => boolean;
  /** Dispara aunque el foco esté en un campo de texto. */
  permitirEnCampo?: boolean;
}

export interface ContextoAtajo {
  /** El foco está en un input, textarea, select o contenteditable. */
  enCampo: boolean;
  /** El lector de códigos tiene una ráfaga sin terminar. */
  rafagaPendiente?: boolean;
}

/** Qué atajo corresponde a un evento, o `null`. Puro: lo prueban los tests. */
export function resolverAtajo<A extends Atajo>(evento: EventoTecla, atajos: readonly A[], ctx: ContextoAtajo): A | null {
  if (ctx.rafagaPendiente) return null;
  const clave = claveDeEvento(evento);
  if (!clave) return null;
  for (const a of atajos) {
    if (claveAtajo(a.tecla) !== clave) continue;
    if (ctx.enCampo && !a.permitirEnCampo && !atajoValidoEnCampo(clave)) continue;
    if (a.cuando && !a.cuando()) continue;
    return a;
  }
  return null;
}

/** Atajos agrupados para el mapa (F1), en el orden en que se registraron. */
export function agruparAtajos<A extends Atajo>(atajos: readonly A[], grupoPorDefecto = ''): { grupo: string; atajos: A[] }[] {
  const grupos = new Map<string, A[]>();
  for (const a of atajos) {
    const g = a.grupo ?? grupoPorDefecto;
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g)!.push(a);
  }
  return Array.from(grupos, ([grupo, lista]) => ({ grupo, atajos: lista }));
}

function esCampoEditable(el: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export interface OpcionesAtajos {
  /** false apaga el ámbito (p. ej. el POS mientras el cobro está abierto). */
  activo?: boolean;
  /** Consulta al detector del lector de códigos. */
  hayRafaga?: () => boolean;
}

export function useAtajos(atajos: readonly Atajo[], { activo = true, hayRafaga }: OpcionesAtajos = {}): void {
  const ref = useRef({ atajos, hayRafaga });
  useEffect(() => {
    ref.current = { atajos, hayRafaga };
  }, [atajos, hayRafaga]);

  useEffect(() => {
    if (!activo) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.repeat) return;
      const { atajos: lista, hayRafaga: rafaga } = ref.current;
      const atajo = resolverAtajo(e, lista, { enCampo: esCampoEditable(e.target), rafagaPendiente: rafaga?.() ?? false });
      if (!atajo) return;
      e.preventDefault();
      atajo.accion();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [activo]);
}
