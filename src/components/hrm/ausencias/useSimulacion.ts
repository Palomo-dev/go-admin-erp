'use client';

/**
 * Vista previa de una solicitud mientras se llena el formulario: la base corre la
 * solicitud real y la deshace (`POST /api/hrm/ausencias/simular`). Espera 300 ms
 * entre cambios y descarta respuestas viejas.
 */
import { useEffect, useRef, useState } from 'react';
import { ErrorPersonas } from '../personas/apiPersonas';
import { simularAusencia, type DatosAusencia } from './apiAusencias';
import type { Simulacion } from './ausenciasLogica';

export function useSimulacion(datos: DatosAusencia | null): { sim: Simulacion | null; cargando: boolean; error: string | null } {
  const [sim, setSim] = useState<Simulacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turno = useRef(0);
  const clave = datos ? JSON.stringify(datos) : null;

  useEffect(() => {
    if (!clave) {
      setSim(null);
      setError(null);
      return;
    }
    const mio = ++turno.current;
    setCargando(true);
    const t = setTimeout(() => {
      simularAusencia(JSON.parse(clave) as DatosAusencia)
        .then((s) => {
          if (turno.current !== mio) return;
          setSim(s);
          setError(null);
        })
        .catch((e) => {
          if (turno.current !== mio) return;
          setSim(null);
          setError(e instanceof ErrorPersonas ? e.codigo : 'error_hrm');
        })
        .finally(() => turno.current === mio && setCargando(false));
    }, 300);
    return () => clearTimeout(t);
  }, [clave]);

  return { sim, cargando, error };
}

export { claveError, codigoError, ERRORES_AUSENCIA } from './ausenciasLogica';
