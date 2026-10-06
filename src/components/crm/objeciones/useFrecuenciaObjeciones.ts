'use client';

/**
 * Lectura de la frecuencia de objeciones (`GET /api/crm/objections/frequency`).
 * Sin `id`: conteos de todas. Con `id`: además tendencia, llamadas y respuestas.
 * `activo = false` no pide nada (la hoja cerrada).
 */
import { useEffect, useState } from 'react';
import { pedirCrm, ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import type { FrecuenciaObjeciones } from '@/lib/services/crm/objectionFrequencyService';

export type EstadoFrecuencia = 'cargando' | 'listo' | 'error' | 'sinPermiso';

export function useFrecuenciaObjeciones(id: string | null, activo = true, revision = 0) {
  const [estado, setEstado] = useState<EstadoFrecuencia>('cargando');
  const [datos, setDatos] = useState<FrecuenciaObjeciones | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!activo) return;
    const ctrl = new AbortController();
    setEstado('cargando');
    const q = id ? `?id=${encodeURIComponent(id)}` : '';
    pedirCrm<FrecuenciaObjeciones>(`/api/crm/objections/frequency${q}`, { signal: ctrl.signal })
      .then(({ data }) => {
        if (ctrl.signal.aborted) return;
        setDatos(data);
        setEstado('listo');
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setEstado(e instanceof ErrorApiCrm && (e.status === 401 || e.status === 403) ? 'sinPermiso' : 'error');
      });
    return () => ctrl.abort();
  }, [id, activo, revision, intento]);

  return { estado, datos, reintentar: () => setIntento((n) => n + 1) };
}
