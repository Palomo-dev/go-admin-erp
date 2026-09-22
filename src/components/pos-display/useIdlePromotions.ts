'use client';

/**
 * Cartelera de promociones del reposo (Fase 4, PLAN §5.2 modo «promociones»).
 *
 * La pantalla se las pide ella misma a `/api/pos/display/promotions`, y no
 * la caja por el canal, por dos razones: el reposo es justo el rato en que la
 * caja no está contando nada, y la tableta remota puede estar en reposo con
 * el POS cerrado. La ruta resuelve la organización y la sucursal desde la
 * terminal (por token en la tableta, por sesión en la pantalla local), así
 * que aquí no se manda ninguna organización.
 *
 * Solo se pide cuando de verdad hacen falta (modo 'promotions'), una vez al
 * montar y luego cada `PROMOTIONS_REFRESH_MS`: el cartel no es tiempo real y
 * cada llamada gasta cupo del cubo de la terminal. Un fallo deja la lista
 * como estaba (o vacía, y entonces el reposo cae a la marca): nunca rompe la
 * pantalla.
 */

import { useEffect, useRef, useState } from 'react';
import { sanitizeDisplayPromotions, type DisplayPromotion } from '@/lib/pos/display/promotions';
import { readStoredRemoteDisplay } from '@/lib/pos/display/remoteDisplay';

/** Cada cuánto se relee la cartelera. Una promoción nueva tarda como mucho esto en salir. */
export const PROMOTIONS_REFRESH_MS = 10 * 60 * 1000;

export const PROMOTIONS_ENDPOINT = '/api/pos/display/promotions';

/**
 * Construye la petición: con token si la pantalla está emparejada (tableta),
 * con `terminalId` en la query si es local (la sesión del POS va en las
 * cookies). Devuelve null si no hay ninguna de las dos cosas.
 */
export function buildPromotionsRequest(terminalId: string | null, token: string | null): { url: string; headers: Record<string, string> } | null {
  if (token) return { url: PROMOTIONS_ENDPOINT, headers: { authorization: `Bearer ${token}` } };
  if (terminalId) return { url: `${PROMOTIONS_ENDPOINT}?terminalId=${encodeURIComponent(terminalId)}`, headers: {} };
  return null;
}

/** Lee el cuerpo de la ruta y lo sanea. Cualquier forma inesperada → lista vacía. */
export function readPromotionsPayload(payload: unknown): DisplayPromotion[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const data = (payload as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return [];
  return sanitizeDisplayPromotions((data as { promotions?: unknown }).promotions);
}

/**
 * @param terminalId Terminal de la pantalla (local o remota); null mientras no se sepa.
 * @param enabled    false si el reposo no es 'promotions': entonces no se pide nada.
 */
export function useIdlePromotions(terminalId: string | null, enabled: boolean): DisplayPromotion[] {
  const [promotions, setPromotions] = useState<DisplayPromotion[]>([]);
  // La última lista se conserva entre recargas del efecto para no parpadear.
  const latest = useRef<DisplayPromotion[]>([]);

  useEffect(() => {
    if (!enabled || !terminalId) return;
    let cancelled = false;

    const load = async () => {
      const token = readStoredRemoteDisplay()?.token ?? null;
      const request = buildPromotionsRequest(terminalId, token);
      if (!request) return;
      try {
        const response = await fetch(request.url, { headers: request.headers, cache: 'no-store' });
        if (!response.ok) {
          console.warn('[pos-display] no se pudieron leer las promociones del reposo:', response.status);
          return;
        }
        const next = readPromotionsPayload(await response.json());
        if (cancelled) return;
        latest.current = next;
        setPromotions(next);
      } catch (err) {
        console.warn('[pos-display] no se pudieron leer las promociones del reposo:', err instanceof Error ? err.message : err);
      }
    };

    void load();
    const timer = setInterval(() => void load(), PROMOTIONS_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [terminalId, enabled]);

  return promotions;
}
