'use client';

/**
 * «Riel mientras estoy montada»: una página pide que el sidebar de escritorio
 * se pinte en rail (72 px) mientras está en pantalla, sin tocar la preferencia
 * guardada de la persona (`shell.sidebar`). Lo usa la Bandeja del Chat (Figma
 * 93-chat-pendientes-00, tarjeta 1: «la Bandeja pliega el menú a riel al entrar
 * y lo devuelve al salir; si la persona lo expande, se respeta»).
 *
 * Es un almacén mínimo fuera de React (contador de solicitudes + oyentes), así
 * no hace falta un proveedor nuevo en `AppLayout`: `SidebarShell` lo lee con
 * `useRielSolicitado()` y lo trata igual que el rail prestado del GO Asistente
 * ampliado (`modoVisibleSidebar`).
 */
import { useEffect, useLayoutEffect, useSyncExternalStore } from 'react';

let solicitudes = 0;
const oyentes = new Set<() => void>();

function avisar(): void {
  oyentes.forEach((f) => f());
}

/** Pide el rail. Devuelve la función que libera ESA solicitud (idempotente). */
export function solicitarRiel(): () => void {
  solicitudes += 1;
  avisar();
  let liberada = false;
  return () => {
    if (liberada) return;
    liberada = true;
    solicitudes = Math.max(0, solicitudes - 1);
    avisar();
  };
}

/** ¿Alguna página pide el rail ahora mismo? */
export function hayRielSolicitado(): boolean {
  return solicitudes > 0;
}

export function suscribirRiel(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Para `SidebarShell`. En el servidor nunca hay solicitud. */
export function useRielSolicitado(): boolean {
  return useSyncExternalStore(suscribirRiel, hayRielSolicitado, () => false);
}

// useLayoutEffect en el navegador: el rail se aplica antes de pintar, sin un
// cuadro con el menú expandido al entrar.
const useEfectoTemprano = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Pide el rail mientras el componente esté montado y `activo` sea verdadero.
 * Mientras `activo` no cambie, la solicitud es la misma: navegar entre páginas
 * que la piden no la suelta y vuelve a pedir (no se pierde el «Expandir» que
 * pulsó la persona).
 */
export function useRielMientrasMontada(activo = true): void {
  useEfectoTemprano(() => (activo ? solicitarRiel() : undefined), [activo]);
}
