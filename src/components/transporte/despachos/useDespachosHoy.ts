'use client';

/**
 * Datos de Viajes › Despachos de hoy: los viajes del día en la sede activa (día calendario en la
 * zona de la organización, nunca UTC), su cumplimiento y los indicadores. Los usa la página de
 * Viajes para las StatCards de arriba y la pestaña Despachos de hoy (una sola lectura).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { cumplimientoDeViajes, listarViajesDelDia, type ViajeDelDia } from '@/lib/services/transporte/despachosService';
import { estadoDespacho, kpisDespachos, ordenarDespachos, type Cumplimiento, type EstadoDespacho } from '@/lib/transporte/despachos';

export interface FilaDespachoHoy {
  id: string;
  salida: string;
  viaje: ViajeDelDia;
  cumplimiento: Cumplimiento | null;
  estado: EstadoDespacho;
}

export function useDespachosHoy() {
  const organizationId = Number(getOrganizationId()) || null;
  const { branchFilter } = useBranch();
  const { getToday } = useFormatDate();
  const fecha = getToday();
  const [viajes, setViajes] = useState<ViajeDelDia[]>([]);
  const [cumplimientos, setCumplimientos] = useState<Map<string, Cumplimiento>>(new Map());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<'sin_permiso' | 'error' | null>(null);
  const [recarga, setRecarga] = useState(0);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    if (!organizationId) return;
    let cancelado = false;
    setCargando(true);
    setError(null);
    (async () => {
      const lista = await listarViajesDelDia(supabase, { organizationId, fecha, branchId: branchFilter });
      const pendientes = lista.filter((v) => !v.despachadoEn && ['scheduled', 'boarding', 'delayed', null].includes(v.status));
      const c = await cumplimientoDeViajes(supabase, pendientes.map((v) => v.id)).catch(() => new Map<string, Cumplimiento>());
      if (cancelado) return;
      setViajes(lista);
      setCumplimientos(c);
    })()
      .catch((e: { code?: string }) => !cancelado && setError(e?.code === '42501' ? 'sin_permiso' : 'error'))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [organizationId, branchFilter, fecha, recarga]);

  const filas = useMemo<FilaDespachoHoy[]>(
    () =>
      ordenarDespachos(
        viajes.map((v) => {
          const c = cumplimientos.get(v.id) ?? null;
          return { id: v.id, salida: v.salida, viaje: v, cumplimiento: c, estado: estadoDespacho({ id: v.id, status: v.status, dispatched_at: v.despachadoEn, dispatch_override_by: v.excepcion ? 'si' : null }, c) };
        }),
      ),
    [viajes, cumplimientos],
  );
  const kpis = useMemo(() => kpisDespachos(filas), [filas]);

  return { organizationId, fecha, filas, kpis, cargando, error, recargar };
}
