'use client';

import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase/config';
import type { PeriodoDashboard, HorasDashboard } from './inicioService';

/**
 * Hook que mantiene los datos del dashboard actualizados en tiempo real.
 *
 * Combina dos estrategias (igual que pedidos-online):
 *  1. Suscripción Realtime a las tablas que alimentan los KPIs.
 *     Cuando cualquier tabla cambia, recarga los datos (con debounce de 800ms
 *     para agrupar ráfagas de cambios).
 *  2. Auto-refresh cada 30 segundos como mecanismo de respaldo.
 *
 * @param organizationId  ID de la organización (null/undefined → no hace nada)
 * @param periodo          Período del dashboard
 * @param horas            Horas opcionales del filtro
 * @param onRefresh        Callback que se llama cuando hay que recargar
 * @param enabled          Si false, no suscribe ni refresca (útil para pausar
 *                         cuando el modal está cerrado)
 */
export function useDashboardRealtime(
  organizationId: number | null | undefined,
  periodo: PeriodoDashboard,
  horas: HorasDashboard | null | undefined,
  onRefresh: () => void,
  enabled: boolean = true,
) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Debounce para agrupar ráfagas de cambios (igual que pedidos-online)
  const scheduleReload = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      reloadTimerRef.current = null;
      onRefreshRef.current();
    }, 800);
  }, []);

  useEffect(() => {
    if (!enabled || !organizationId) return;

    // Suscripción Realtime a todas las tablas que alimentan los KPIs.
    // Un solo canal escucha cambios en cualquier tabla de la organización.
    const channel = supabase
      .channel(`dashboard_realtime_${organizationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', filter: `organization_id=eq.${organizationId}` },
        () => scheduleReload(),
      )
      .subscribe();

    channelRef.current = channel;

    // Auto-refresh cada 30s como respaldo (igual que pedidos-online)
    intervalRef.current = setInterval(() => {
      onRefreshRef.current();
    }, 30_000);

    return () => {
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, enabled, periodo, horas, scheduleReload]);
}
