'use client';

import { useCallback, useEffect, useState } from 'react';
import { ErrorApiCrm, EVENTO_CAMBIO_CRM, type DetalleCambioCrm } from '@/components/crm/acciones/apiCrm';
import { leerOportunidad, type OportunidadDetalleApi } from './apiOportunidades';

/**
 * Una oportunidad por `GET /api/crm/opportunities/[id]` (servidor: cliente,
 * etapa, pipeline, líneas y `entro_etapa_en`). Estados del drawer y del
 * detalle: cargando · no encontrada (404) · sin permiso (401/403) · error.
 * Se recarga con `crm:entity-changed` de esa oportunidad.
 */
export type EstadoOportunidad = 'cargando' | 'listo' | 'noEncontrada' | 'sinPermiso' | 'error';

export function useOportunidad(id: string | null) {
  const [data, setData] = useState<OportunidadDetalleApi | null>(null);
  const [estado, setEstado] = useState<EstadoOportunidad>('cargando');
  const [recarga, setRecarga] = useState(0);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    if (!id) return;
    const control = new AbortController();
    setEstado((e) => (e === 'listo' ? e : 'cargando'));
    leerOportunidad(id, control.signal)
      .then((d) => {
        setData(d);
        setEstado('listo');
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        const s = e instanceof ErrorApiCrm ? e.status : 0;
        setEstado(s === 404 || s === 400 ? 'noEncontrada' : s === 401 || s === 403 ? 'sinPermiso' : 'error');
      });
    return () => control.abort();
  }, [id, recarga]);

  useEffect(() => {
    const oir = (ev: Event) => {
      const d = (ev as CustomEvent<DetalleCambioCrm>).detail;
      if (!d?.id || d.id === id) recargar();
    };
    window.addEventListener(EVENTO_CAMBIO_CRM, oir);
    return () => window.removeEventListener(EVENTO_CAMBIO_CRM, oir);
  }, [id, recargar]);

  return { data, estado, recargar };
}
