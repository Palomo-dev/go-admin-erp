'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EVENTO_CAMBIO_CRM, pedirCrm } from '@/components/crm/acciones/apiCrm';
import { resumenEnBase } from '@/components/crm/oportunidad/oportunidadLogica';
import type { ResumenPipelinesApi } from '@/lib/services/crm/oportunidadesLecturaService';
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

/**
 * Abiertas de un pipeline en la moneda base (Figma 1821:189325: «23 abiertas ·
 * $ 184.500.000»). `total` es null si nada se pudo convertir (todo sin tasa).
 */
export function abiertasDePipeline(resumen: ResumenPipelinesApi | null, pipelineId: string, hoy: string | null): { cantidad: number; total: number | null; base: string; sinTasa: number } | null {
  if (!resumen) return null;
  const a = resumen.por_pipeline[pipelineId];
  if (!a) return { cantidad: 0, total: 0, base: resumen.base, sinTasa: 0 };
  const r = resumenEnBase(a.grupos, resumen.base, resumen.tasas, hoy);
  const sinTasa = r.sinTasa.reduce((s, g) => s + g.cantidad, 0);
  return { cantidad: a.cantidad, total: sinTasa === a.cantidad && a.cantidad > 0 ? null : r.total, base: resumen.base, sinTasa };
}

/**
 * `hoy` (día de la organización) fija la tasa de cambio vigente del monto
 * abierto. La lista se recarga cuando cambian pipelines o etapas; el resumen
 * («N abiertas · monto») también cuando cambia cualquier oportunidad, sin
 * volver a pintar la lista.
 */
export function usePipelines(hoy: string | null = null) {
  const [lista, setLista] = useState<PipelineSelector[] | null>(null);
  const [resumen, setResumen] = useState<ResumenPipelinesApi | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [recarga, setRecarga] = useState(0);
  const [recargaResumen, setRecargaResumen] = useState(0);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const primera = useRef(true);
  const url = useCallback(() => {
    const qs = new URLSearchParams({ resumen: '1' });
    if (hoy) qs.set('today', hoy);
    return `/api/crm/pipelines?${qs}`;
  }, [hoy]);
  useEffect(() => {
    let vivo = true;
    pedirCrm<PipelineSelector[]>(url())
      .then(({ data, extra }) => {
        if (!vivo) return;
        setLista(data ?? []);
        setResumen((extra.resumen as ResumenPipelinesApi | undefined) ?? null);
        setError(null);
      })
      .catch((e: unknown) => vivo && setError(e));
    return () => {
      vivo = false;
    };
  }, [recarga, url]);
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    let vivo = true;
    // Un fallo aquí no tumba la pantalla: el selector vuelve a «N etapas».
    pedirCrm<PipelineSelector[]>(url())
      .then(({ extra }) => vivo && setResumen((extra.resumen as ResumenPipelinesApi | undefined) ?? null))
      .catch(() => vivo && setResumen(null));
    return () => {
      vivo = false;
    };
  }, [recargaResumen, url]);
  useEffect(() => {
    const oir = (ev: Event) => {
      const d = (ev as CustomEvent<{ accion?: string; entidad?: string }>).detail;
      if (d?.accion === 'pipeline' || d?.accion === 'etapas') recargar();
      else if (d?.entidad === 'opportunity') setRecargaResumen((n) => n + 1);
    };
    window.addEventListener(EVENTO_CAMBIO_CRM, oir);
    return () => window.removeEventListener(EVENTO_CAMBIO_CRM, oir);
  }, [recargar]);
  return { lista, resumen, error, recargar, sinVentas: !!lista && !lista.some((p) => p.pipeline_type === 'sales') };
}
