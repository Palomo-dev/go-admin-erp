'use client';

/**
 * Conteo en vivo del constructor: cada cambio de reglas, tras 600 ms sin
 * escribir, pide el conteo al SERVIDOR (`POST /api/crm/segments/preview`) y
 * cancela la petición anterior. Nunca cuenta en el navegador.
 */
import { useEffect, useState } from 'react';
import { pedirCrm, ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import type { ConteoSegmento } from '@/lib/services/crm/segmentosConteoService';
import { filtroParaGuardar } from '@/lib/services/crm/segmentosFiltroLogica';
import type { FilterRule } from '../types';
import { ESPERA_CONTEO_MS, claveGrupos, estadoDeError, gruposParaContar, type EstadoConteo } from './conteoSegmentoLogica';

export interface ConteoEnVivo {
  estado: EstadoConteo;
  conteo: ConteoSegmento | null;
  reintentar: () => void;
}

export function useConteoSegmento(grupos: readonly FilterRule[][]): ConteoEnVivo {
  const clave = claveGrupos(grupos);
  const [revision, setRevision] = useState(0);
  const [estado, setEstado] = useState<EstadoConteo>('contando');
  const [conteo, setConteo] = useState<ConteoSegmento | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setEstado('contando');
    const t = setTimeout(() => {
      const filtro = filtroParaGuardar(gruposParaContar(JSON.parse(clave) as FilterRule[][]));
      pedirCrm<ConteoSegmento>('/api/crm/segments/preview', { method: 'POST', cuerpo: { filter_json: filtro }, signal: ctrl.signal })
        .then(({ data }) => {
          if (ctrl.signal.aborted) return;
          setConteo(data);
          setEstado('listo');
        })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted) return;
          setEstado(e instanceof ErrorApiCrm ? estadoDeError(e.status) : 'error');
        });
    }, ESPERA_CONTEO_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [clave, revision]);

  return { estado, conteo, reintentar: () => setRevision((n) => n + 1) };
}
