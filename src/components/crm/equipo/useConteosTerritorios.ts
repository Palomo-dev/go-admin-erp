'use client';

/** Conteos por territorio (`GET /api/crm/territories/counts`), calculados en el servidor. */
import { useEffect, useState } from 'react';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { ConteosTerritorios } from '@/lib/services/crm/territoryCountsService';

export function useConteosTerritorios(revision: number) {
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [datos, setDatos] = useState<ConteosTerritorios | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    setEstado('cargando');
    pedirCrm<ConteosTerritorios>('/api/crm/territories/counts', { signal: ctrl.signal })
      .then(({ data }) => {
        if (ctrl.signal.aborted) return;
        setDatos(data);
        setEstado('listo');
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setEstado('error');
      });
    return () => ctrl.abort();
  }, [revision]);
  return { estado, datos };
}
