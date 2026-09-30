'use client';

import { useCallback, useEffect, useState } from 'react';
import { EVENTO_CAMBIO_CRM, pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { PipelineSelector } from './SelectorPipeline';

/**
 * Pipelines de la organización con sus etapas (`GET /api/crm/pipelines`) y
 * cuál abre el tablero: el que la persona eligió, si no el POR DEFECTO, si no
 * el primero de ventas, si no el primero. Sin pipeline de ventas, la pantalla
 * muestra «sin embudo de ventas» (plan §4.3).
 */
export function elegirPipeline(lista: readonly PipelineSelector[], elegido: string | null): string | null {
  if (elegido && lista.some((p) => p.id === elegido)) return elegido;
  return (lista.find((p) => p.is_default) ?? lista.find((p) => p.pipeline_type === 'sales') ?? lista[0])?.id ?? null;
}

export function usePipelines() {
  const [lista, setLista] = useState<PipelineSelector[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [recarga, setRecarga] = useState(0);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  useEffect(() => {
    let vivo = true;
    pedirCrm<PipelineSelector[]>('/api/crm/pipelines')
      .then(({ data }) => vivo && (setLista(data ?? []), setError(null)))
      .catch((e: unknown) => vivo && setError(e));
    return () => {
      vivo = false;
    };
  }, [recarga]);
  useEffect(() => {
    const oir = (ev: Event) => {
      const accion = (ev as CustomEvent<{ accion?: string }>).detail?.accion;
      if (accion === 'pipeline' || accion === 'etapas') recargar();
    };
    window.addEventListener(EVENTO_CAMBIO_CRM, oir);
    return () => window.removeEventListener(EVENTO_CAMBIO_CRM, oir);
  }, [recargar]);
  return { lista, error, recargar, sinVentas: !!lista && !lista.some((p) => p.pipeline_type === 'sales') };
}
