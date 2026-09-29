'use client';

import { useCallback, useEffect, useState } from 'react';
import { ErrorPeticionMembresias } from '@/lib/services/membresias/clienteMembresias';

export interface CargaMembresias<T> {
  datos: T | null;
  cargando: boolean;
  error: ErrorPeticionMembresias | null;
  recargar: () => void;
}

/**
 * Carga de una petición a `/api/membresias/**` con cancelación de respuestas viejas.
 * `clave` identifica la consulta (filtros serializados): si cambia, se vuelve a pedir.
 * Los datos anteriores se conservan mientras llega la respuesta nueva (paginación sin parpadeo).
 */
export function useCargaMembresias<T>(clave: string, pedir: () => Promise<T>): CargaMembresias<T> {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<ErrorPeticionMembresias | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    pedir()
      .then((d) => {
        if (vivo) setDatos(d);
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setError(e instanceof ErrorPeticionMembresias ? e : new ErrorPeticionMembresias('error_interno', 0));
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
    // `pedir` se recrea en cada render: la consulta la identifica `clave`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, recarga]);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  return { datos, cargando, error, recargar };
}

/** 403 o `sin_permiso`: la pantalla muestra «sin permiso» en lugar de «error». */
export function esSinPermiso(error: ErrorPeticionMembresias | null): boolean {
  return !!error && (error.estado === 403 || error.codigo === 'sin_permiso');
}
