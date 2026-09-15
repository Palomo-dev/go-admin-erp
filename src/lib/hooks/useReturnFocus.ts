'use client';

/**
 * Devuelve el foco al elemento que abrió un diálogo/panel (brief UX §4).
 *
 * Hook compartido (ronda 2 de Automatizaciones). Nació en
 * `src/components/crm/secuencias/useReturnFocus.ts`; ese duplicado se borró en
 * la ronda 2 de Secuencias y ambos módulos importan este. Contrato:
 * `useReturnFocus(open, fallback?) → onCloseAutoFocus`.
 *
 * Los `Dialog`/`Sheet` modales de Radix, cuando se abren por estado y no por
 * `DialogTrigger`, al cerrarse hacen `preventDefault` del autofoco y enfocan
 * `triggerRef.current`, que es `null`: el foco cae al `body`. Este hook
 * captura `document.activeElement` en el momento de abrir y lo restaura en
 * `onCloseAutoFocus`. Si ese elemento ya no existe (p. ej. se borró la
 * tarjeta), enfoca `fallback()`.
 */

import { useCallback, useEffect, useRef } from 'react';

/**
 * Puro: quién abrió. El `body` cuenta como «sin disparador» (Safari no enfoca
 * un botón al pulsarlo con el ratón): restaurarlo al `body` sería perder el foco.
 */
export function openerFrom<T>(active: T | null, body: T | null): T | null {
  if (!active || active === body) return null;
  return active;
}

/** Puro: a dónde vuelve el foco: al disparador si sigue en el DOM; si no, al fallback. */
export function returnTarget<T extends { isConnected: boolean }>(opener: T | null, fallback?: () => T | null): T | null {
  if (opener && opener.isConnected) return opener;
  return fallback?.() ?? null;
}

export function useReturnFocus(open: boolean, fallback?: () => HTMLElement | null) {
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open && typeof document !== 'undefined') {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      opener.current = openerFrom(active, document.body);
    }
  }, [open]);

  const onCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    returnTarget(opener.current, fallback)?.focus();
    opener.current = null;
  }, [fallback]);

  return onCloseAutoFocus;
}
