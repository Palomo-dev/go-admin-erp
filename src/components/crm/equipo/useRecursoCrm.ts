'use client';

/**
 * Lectura de una ruta `GET /api/crm/**` con estados honestos: cargando, listo,
 * error y sin permiso (403). `recargar()` vuelve a pedirla sin vaciar los
 * datos que ya se ven.
 */
import { useCallback, useEffect, useState } from 'react';
import { ErrorApiCrm, pedirCrm } from '@/components/crm/acciones/apiCrm';

export type EstadoRecurso = 'cargando' | 'listo' | 'error' | 'sinPermiso';

export function useRecursoCrm<T>(url: string | null) {
  const [estado, setEstado] = useState<EstadoRecurso>('cargando');
  const [datos, setDatos] = useState<T | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    setEstado('cargando');
    pedirCrm<T>(url, { signal: ctrl.signal })
      .then(({ data }) => {
        if (ctrl.signal.aborted) return;
        setDatos(data);
        setEstado('listo');
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setEstado(e instanceof ErrorApiCrm && (e.status === 401 || e.status === 403) ? 'sinPermiso' : 'error');
      });
    return () => ctrl.abort();
  }, [url, revision]);

  const recargar = useCallback(() => setRevision((n) => n + 1), []);
  return { estado, datos, recargar };
}
