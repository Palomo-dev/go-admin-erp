'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase/config';

/**
 * Hook que cuenta visitantes activos en tiempo real.
 *
 * "Activo" = visita con created_at en los últimos 5 minutos.
 *
 * Al montarse:
 *  1. Consulta cuántas visitas hay en los últimos 5 min (count inicial).
 *  2. Se suscribe via Realtime a INSERT en website_visits.
 *  3. Cada INSERT nuevo incrementa el contador.
 *  4. Cada 30 segundos re-valida el count con una query para evitar drift.
 *
 * @param organizationId - ID de la organización
 * @returns { liveCount, isActive } donde isActive indica si la suscripción está viva
 */
export function useLiveVisitors(organizationId: number | null | undefined) {
  const [liveCount, setLiveCount] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const revalidateRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCount = useCallback(async () => {
    if (!organizationId) return;
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from('website_visits')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', fiveMinAgo);
    if (!error && count !== null) {
      setLiveCount(count);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) return;

    // Count inicial
    fetchCount();

    // Suscripción Realtime a INSERTs
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
          // Incrementar optimistamente + re-validar
          setLiveCount((prev) => prev + 1);
        },
      )
      .subscribe((status) => {
        setIsActive(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;

    // Re-validar cada 30s para mantener el count exacto
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
      setIsActive(false);
    };
  }, [organizationId, fetchCount]);

  return { liveCount, isActive };
}
