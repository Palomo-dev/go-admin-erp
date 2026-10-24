'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/config';
import { CANAL_PROMOCIONES, EVENTO_PROMOCIONES } from '@/lib/pos/venta/avisosPromociones';

/** Respaldo si se cae realtime o el aviso del mismo navegador. */
export const INTERVALO_RESPALDO_PROMOCIONES_MS = 60_000;

const ESPERA_MS = 400;

/**
 * Vuelve a calcular la cuenta abierta cuando cambia una promoción, sin tocar
 * las líneas a mano.
 *
 * Se dispara al montar (volver al POS después de editar en esta pestaña), al
 * enfocar, al hacerse visible, por el evento de la misma pestaña, por
 * `BroadcastChannel` (otra pestaña), por `postgres_changes` de `promotions` y
 * `promotion_rules` (otro equipo) y cada 60 s si la pestaña está visible. La
 * suscripción usa la cuenta actual: al cambiar de carrito o de venta se suelta
 * la anterior.
 */
export function useRecalcularAlCambiarPromociones(opciones: {
  organizationId: number | null | undefined;
  cuentaId: string | null;
  hayLineas: boolean;
  recalcular: (cuentaId: string) => void | Promise<void>;
}): void {
  const recalcularRef = useRef(opciones.recalcular);
  recalcularRef.current = opciones.recalcular;
  const cuentaIdRef = useRef(opciones.cuentaId);
  cuentaIdRef.current = opciones.cuentaId;
  const hayLineasRef = useRef(opciones.hayLineas);
  hayLineasRef.current = opciones.hayLineas;

  const { organizationId, cuentaId, hayLineas } = opciones;

  useEffect(() => {
    if (!hayLineas || !cuentaId || !organizationId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let vivo = true;
    const correr = () => {
      if (!hayLineasRef.current) return;
      const id = cuentaIdRef.current;
      if (!id) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!vivo || !hayLineasRef.current || cuentaIdRef.current !== id) return;
        Promise.resolve(recalcularRef.current(id)).catch((err) => {
          console.error('Error recalculando promociones:', err);
        });
      }, ESPERA_MS);
    };
    correr();
    const alVolver = () => {
      if (document.visibilityState === 'visible') correr();
    };
    window.addEventListener('focus', correr);
    window.addEventListener(EVENTO_PROMOCIONES, correr);
    document.addEventListener('visibilitychange', alVolver);
    let bc: BroadcastChannel | undefined;
    try {
      bc = new BroadcastChannel(CANAL_PROMOCIONES);
      bc.onmessage = () => correr();
    } catch {
      bc = undefined;
    }
    const canal = supabase
      .channel(`pos-promos-${organizationId}-${cuentaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promotions', filter: `organization_id=eq.${organizationId}` }, correr)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promotion_rules' }, correr)
      .subscribe();
    const respaldo = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (!hayLineasRef.current) return;
      correr();
    }, INTERVALO_RESPALDO_PROMOCIONES_MS);
    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
      window.clearInterval(respaldo);
      window.removeEventListener('focus', correr);
      window.removeEventListener(EVENTO_PROMOCIONES, correr);
      document.removeEventListener('visibilitychange', alVolver);
      bc?.close();
      supabase.removeChannel(canal);
    };
  }, [organizationId, cuentaId, hayLineas]);
}
