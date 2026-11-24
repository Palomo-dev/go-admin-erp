'use client';

/**
 * Datos que el asistente de campañas de voz lee de rutas que ya existen
 * (ninguna lógica nueva en el navegador; toda escritura va por `/api/crm/**`):
 *
 *  - agentes:        GET /api/crm/voice-agents
 *  - voces:          GET /api/crm/voices
 *  - métricas:       GET /api/crm/voice-agents/[id]/metrics?periodo=30d (duración media y etapas)
 *  - minutos:        GET /api/crm/config/credits (comm.voice_minutes_remaining)
 *  - política:       GET /api/crm/settings/telephony (data_policy_url, can_edit)
 *  - diagnóstico:    GET /api/crm/voice-agents/campaigns/diagnostics (motivos de la organización)
 *  - secuencias:     GET /api/crm/sequences (con sus pasos)
 *
 * Cada lectura falla por separado: si una no responde, su bloque lo dice y el
 * resto del asistente sigue.
 */

import { useCallback, useEffect, useState } from 'react';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';

export interface AgenteVoz {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  first_message: string;
  identity_disclosure: string | null;
  voice_ref_id: string | null;
  voice_settings: Record<string, unknown> | null;
  language: string | null;
  max_calls_per_day: number | null;
  max_calls_per_hour: number | null;
}

export interface VozCatalogo {
  id: string;
  name: string;
  kind: 'library' | 'cloned' | 'designed' | string;
  language: string | null;
  preview_url: string | null;
}

export interface MetricasAgente {
  duracionMediaSeg: number | null;
  etapas: { stage_id: string; etapa: string; posicion: number | null }[];
}

export interface MotivoOrganizacion {
  codigo: string;
  bloquea: boolean;
  datos?: Record<string, number | string>;
}

export interface SecuenciaConPasos {
  id: string;
  name: string;
  is_active: boolean;
  steps: { id: string; step_number: number; channel: string }[];
}

export interface Telefonia {
  politicaUrl: string | null;
  puedeEditar: boolean;
}

type Lectura<T> = { estado: 'cargando' } | { estado: 'error' } | { estado: 'listo'; datos: T };

function useLectura<T>(url: string | null, transformar: (data: unknown, extra: Record<string, unknown>) => T) {
  const [lectura, setLectura] = useState<Lectura<T>>({ estado: 'cargando' });
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    setLectura({ estado: 'cargando' });
    pedirCrm<unknown>(url, { signal: ctrl.signal })
      .then(({ data, extra }) => setLectura({ estado: 'listo', datos: transformar(data, extra) }))
      .catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setLectura({ estado: 'error' });
      });
    return () => ctrl.abort();
    // `transformar` es estable por diseño (funciones del módulo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, vuelta]);
  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return [lectura, recargar] as const;
}

const comoAgentes = (data: unknown) => (Array.isArray(data) ? (data as AgenteVoz[]) : []);
const comoVoces = (data: unknown) => (Array.isArray(data) ? (data as VozCatalogo[]) : []);
const comoMinutos = (_data: unknown, extra: Record<string, unknown>) => {
  const comm = extra.comm as { voice_minutes_remaining?: number | null } | undefined;
  return typeof comm?.voice_minutes_remaining === 'number' ? comm.voice_minutes_remaining : null;
};
const comoTelefonia = (data: unknown, extra: Record<string, unknown>): Telefonia => ({
  politicaUrl: ((data as { data_policy_url?: string | null } | null)?.data_policy_url ?? null) || null,
  puedeEditar: extra.can_edit === true,
});
const comoMotivos = (data: unknown) => ((data as { organizacion?: MotivoOrganizacion[] } | null)?.organizacion ?? []) as MotivoOrganizacion[];
const comoSecuencias = (data: unknown) => (Array.isArray(data) ? (data as SecuenciaConPasos[]).map((s) => ({ ...s, steps: s.steps ?? [] })) : []);
const comoMetricas = (data: unknown): MetricasAgente => {
  const d = data as { totales?: { duracion_media_segundos?: number | null }; etapas?: MetricasAgente['etapas'] } | null;
  const etapas = [...(d?.etapas ?? [])].sort((a, b) => (a.posicion ?? 0) - (b.posicion ?? 0));
  return { duracionMediaSeg: d?.totales?.duracion_media_segundos ?? null, etapas };
};

export function useDatosAsistenteVoz(agenteId: string | null, necesitaSecuencias: boolean, enRevision: boolean) {
  const [agentes] = useLectura('/api/crm/voice-agents', comoAgentes);
  const [voces] = useLectura('/api/crm/voices', comoVoces);
  const [minutos] = useLectura('/api/crm/config/credits', comoMinutos);
  const [telefonia, recargarTelefonia] = useLectura('/api/crm/settings/telephony', comoTelefonia);
  const [motivos, recargarMotivos] = useLectura(enRevision ? '/api/crm/voice-agents/campaigns/diagnostics' : null, comoMotivos);
  const [secuencias] = useLectura(necesitaSecuencias ? '/api/crm/sequences' : null, comoSecuencias);
  const [metricas] = useLectura(agenteId ? `/api/crm/voice-agents/${encodeURIComponent(agenteId)}/metrics?periodo=30d` : null, comoMetricas);
  return { agentes, voces, minutos, telefonia, recargarTelefonia, motivos, recargarMotivos, secuencias, metricas };
}

export type DatosAsistenteVoz = ReturnType<typeof useDatosAsistenteVoz>;
export type { Lectura };
