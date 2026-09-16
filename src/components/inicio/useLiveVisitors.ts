'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase/config';

/**
 * Hook que cuenta visitantes activos en tiempo real.
 *
 * "Activo" = sesión con alguna visita en los últimos 5 minutos, según el
 * reloj del SERVIDOR (RPC `website_live_visitors`). Antes el filtro se
 * calculaba con `Date.now()` del navegador: con un PC atrasado casi 9 h
 * (caso real del 2026-09-15) "los últimos 5 minutos" eran 9 horas y el badge
 * mostraba 1.783 visitantes. Y contaba filas (páginas vistas), no personas.
 *
 * Al montarse:
 *  1. Pide el conteo exacto.
 *  2. Se suscribe via Realtime a INSERT en website_visits y, ante cada
 *     inserción, vuelve a pedir el conteo (agrupando ráfagas). No se
 *     incrementa a ciegas: el conteo real nunca se desvía del servidor.
 *  3. Cada 30 s re-valida igualmente, para que las sesiones que dejan de
 *     estar activas descuenten.
 *
 * @param organizationId - ID de la organización
 * @returns { liveCount, isActive } donde isActive indica si la suscripción está viva
 */
export function useLiveVisitors(organizationId: number | null | undefined) {
  const [liveCount, setLiveCount] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const revalidateRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCount = useCallback(async () => {
    if (!organizationId) return;
    const { data, error } = await supabase.rpc('website_live_visitors', {
      p_organization_id: organizationId,
      p_minutes: 5,
    });
    if (error) {
      console.warn('[useLiveVisitors] no se pudo contar visitantes en vivo:', error.message);
      return;
    }
    setLiveCount(Number(data) || 0);
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) return;

    // Conteo inicial
    fetchCount();

    // Ante cada INSERT, re-consultar (agrupando las ráfagas en una sola llamada)
    const channel = supabase
      .channel(`website_visits_live_${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'website_visits',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            debounceRef.current = null;
            void fetchCount();
          }, 2_000);
        },
      )
      .subscribe((status) => {
        setIsActive(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;

    // Re-validar cada 30 s para que las sesiones inactivas descuenten
    revalidateRef.current = setInterval(fetchCount, 30_000);

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (revalidateRef.current) {
        clearInterval(revalidateRef.current);
        revalidateRef.current = null;
      }
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      setIsActive(false);
    };
  }, [organizationId, fetchCount]);

  return { liveCount, isActive };
}
