'use client';

/** Lectura de `GET /api/crm/forecast`: foto calculada en el servidor, cancelable. */
import { useEffect, useState } from 'react';
import { pedirCrm, ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import type { RespuestaPronostico } from '@/lib/services/crm/forecastService';

export type EstadoPronostico = 'cargando' | 'listo' | 'error' | 'sinPermiso';

export interface FiltrosPronostico {
  period: string | null;
  team_id: string | null;
  user_id: string | null;
  page: number;
}

export function usePronosticoTrimestre(f: FiltrosPronostico, revision: number) {
  const [estado, setEstado] = useState<EstadoPronostico>('cargando');
  const [datos, setDatos] = useState<RespuestaPronostico | null>(null);
  const params = new URLSearchParams();
  if (f.period) params.set('period', f.period);
  if (f.team_id) params.set('team_id', f.team_id);
  if (f.user_id) params.set('user_id', f.user_id);
  params.set('page', String(f.page));
  const qs = params.toString();

  useEffect(() => {
    const ctrl = new AbortController();
    setEstado('cargando');
    pedirCrm<RespuestaPronostico>(`/api/crm/forecast?${qs}`, { signal: ctrl.signal })
      .then(({ data }) => {
        if (ctrl.signal.aborted) return;
        setDatos(data);
        setEstado('listo');
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setEstado(e instanceof ErrorApiCrm && (e.status === 401 || e.status === 403) ? 'sinPermiso' : 'error');
      });
    return () => ctrl.abort();
  }, [qs, revision]);

  return { estado, datos };
}
