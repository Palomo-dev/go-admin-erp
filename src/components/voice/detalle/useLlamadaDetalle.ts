'use client';

/**
 * Lee una llamada para su detalle (`GET /api/crm/calls/[id]`, con cliente,
 * oportunidad, quién llamó y su historial). Mientras la grabación se procesa
 * vuelve a leer cada 10 s (anotación 1365:801444: «la página se actualiza sola»).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorApiCrm, pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { LlamadaDetalle } from './llamadaDetalleLogica';

export const SONDEO_DETALLE_MS = 10_000;

export type EstadoCargaLlamada =
  | { tipo: 'cargando' }
  | { tipo: 'listo'; llamada: LlamadaDetalle }
  | { tipo: 'error'; sinPermiso: boolean; noExiste: boolean };

export function useLlamadaDetalle(id: string, sondear: (l: LlamadaDetalle) => boolean) {
  const [estado, setEstado] = useState<EstadoCargaLlamada>({ tipo: 'cargando' });
  const vivo = useRef(true);
  const sondearRef = useRef(sondear);
  sondearRef.current = sondear;

  const cargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setEstado({ tipo: 'cargando' });
      try {
        const { data } = await pedirCrm<LlamadaDetalle>(`/api/crm/calls/${encodeURIComponent(id)}`);
        if (vivo.current) setEstado({ tipo: 'listo', llamada: { ...data, recordings: data.recordings ?? [], consents: data.consents ?? [] } });
      } catch (e) {
        if (!vivo.current) return;
        // Un fallo del sondeo no tira la página que ya se ve.
        if (silencioso) return;
        const status = e instanceof ErrorApiCrm ? e.status : 0;
        setEstado({ tipo: 'error', sinPermiso: status === 401 || status === 403, noExiste: status === 404 });
      }
    },
    [id],
  );

  useEffect(() => {
    vivo.current = true;
    void cargar();
    return () => {
      vivo.current = false;
    };
  }, [cargar]);

  const llamada = estado.tipo === 'listo' ? estado.llamada : null;
  useEffect(() => {
    if (!llamada || !sondearRef.current(llamada)) return;
    const h = setTimeout(() => void cargar(true), SONDEO_DETALLE_MS);
    return () => clearTimeout(h);
  }, [llamada, cargar]);

  return { estado, recargar: cargar };
}
