'use client';

/**
 * Carga de una lectura de `/api/organizacion/roles/**` con los estados del
 * diseño: cargando · listo · error · sin permiso (403) · no encontrado (404).
 * Una respuesta que llega tarde (otra organización, otra pantalla) se descarta.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorPeticionRoles } from '@/lib/services/roles/clienteRoles';

export type EstadoCarga = 'cargando' | 'listo' | 'error' | 'sinPermiso' | 'noEncontrado';

export function useCargaRoles<T>(cargar: () => Promise<T>, clave: string) {
  const [estado, setEstado] = useState<EstadoCarga>('cargando');
  const [datos, setDatos] = useState<T | null>(null);
  const turno = useRef(0);
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;

  const recargar = useCallback(async (silencioso = false) => {
    const mio = ++turno.current;
    if (!silencioso) setEstado('cargando');
    try {
      const r = await cargarRef.current();
      if (mio !== turno.current) return;
      setDatos(r);
      setEstado('listo');
    } catch (err) {
      if (mio !== turno.current) return;
      const estadoHttp = err instanceof ErrorPeticionRoles ? err.estado : 0;
      setEstado(estadoHttp === 403 ? 'sinPermiso' : estadoHttp === 404 ? 'noEncontrado' : 'error');
    }
  }, []);

  useEffect(() => {
    void recargar();
    // `clave` cambia cuando cambia lo que se pide (id, organización).
  }, [recargar, clave]);

  return { estado, datos, setDatos, recargar };
}
