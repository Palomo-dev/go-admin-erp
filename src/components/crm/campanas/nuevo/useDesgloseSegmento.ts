'use client';

/**
 * Desglose por canal del segmento elegido (anotación 1395:1613: «Conteos por
 * canal = mismo endpoint de vista previa de segmentos»). Pide al SERVIDOR
 * `POST /api/crm/segments/preview` con el filtro guardado del segmento; nunca
 * cuenta en el navegador. Cancela la petición anterior al cambiar de segmento.
 */
import { useEffect, useState } from 'react';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { ConteoSegmento, DesgloseSegmento } from '@/lib/services/crm/segmentosConteoService';

export type EstadoDesglose = 'inactivo' | 'contando' | 'listo' | 'error';

export function useDesgloseSegmento(filtro: unknown, activo: boolean): { estado: EstadoDesglose; desglose: DesgloseSegmento | null } {
  const clave = activo ? JSON.stringify(filtro ?? []) : null;
  const [estado, setEstado] = useState<EstadoDesglose>('inactivo');
  const [desglose, setDesglose] = useState<DesgloseSegmento | null>(null);

  useEffect(() => {
    if (clave === null) {
      setEstado('inactivo');
      setDesglose(null);
      return;
    }
    const ctrl = new AbortController();
    setEstado('contando');
    pedirCrm<ConteoSegmento>('/api/crm/segments/preview', { method: 'POST', cuerpo: { filter_json: JSON.parse(clave) as unknown }, signal: ctrl.signal })
      .then(({ data }) => {
        if (ctrl.signal.aborted) return;
        setDesglose(data.desglose);
        setEstado('listo');
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setEstado('error');
      });
    return () => ctrl.abort();
  }, [clave]);

  return { estado, desglose };
}
