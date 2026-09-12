'use client';

/**
 * useCrmLookups — catálogos compartidos para los formularios de automatizaciones,
 * secuencias y agentes IA (FASE-08 / FASE-06).
 *
 * Carga pipelines, etapas, secuencias y plantillas desde el cliente de Supabase
 * del navegador (respeta RLS). Evita que cada diálogo pida IDs a mano: los
 * selectores visuales consumen este hook.
 *
 * Las lecturas son defensivas: si una tabla está vacía o falla, el selector
 * correspondiente muestra un mensaje en vez de romper el formulario.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export interface PipelineOption {
  id: string;
  name: string;
  pipeline_type?: string | null;
  is_default?: boolean;
}

export interface StageOption {
  id: string;
  name: string;
  pipeline_id: string;
  position: number;
  is_won?: boolean;
  is_lost?: boolean;
}

export interface SequenceOption {
  id: string;
  name: string;
  is_active: boolean;
}

export interface TemplateOption {
  id: string;
  name: string;
  channel: string | null;
  kind: string | null;
}

export interface CrmLookupsState {
  pipelines: PipelineOption[];
  stages: StageOption[];
  sequences: SequenceOption[];
  templates: TemplateOption[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Carga todos los catálogos en paralelo. Cada uno es independiente: si uno
 * falla, los demás siguen disponibles.
 */
export function useCrmLookups(): CrmLookupsState {
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [stages, setStages] = useState<StageOption[]>([]);
  const [sequences, setSequences] = useState<SequenceOption[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const orgId = getOrganizationId();
    if (!orgId || orgId <= 0) {
      setLoading(false);
      setError('No hay organización activa.');
      return;
    }

    const [
      pipelinesRes,
      stagesRes,
      sequencesRes,
      templatesRes,
    ] = await Promise.all([
      supabase
        .from('pipelines')
        .select('id, name, pipeline_type, is_default')
        .eq('organization_id', orgId)
        .order('is_default', { ascending: false })
        .order('name', { ascending: true }),
      supabase
        .from('stages')
        .select('id, name, pipeline_id, position, is_won, is_lost')
        .order('position', { ascending: true }),
      supabase
        .from('sequences')
        .select('id, name, is_active')
        .order('name', { ascending: true }),
      supabase
        .from('templates')
        .select('id, name, channel, kind')
        .order('name', { ascending: true }),
    ]);

    if (pipelinesRes.error) {
      setError(pipelinesRes.error.message);
    }
    setPipelines((pipelinesRes.data ?? []) as PipelineOption[]);
    setStages((stagesRes.data ?? []) as StageOption[]);
    setSequences((sequencesRes.data ?? []) as SequenceOption[]);
    setTemplates((templatesRes.data ?? []) as TemplateOption[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { pipelines, stages, sequences, templates, loading, error, reload };
}

/**
 * Filtra las etapas que pertenecen a un pipeline concreto.
 */
export function stagesOfPipeline(stages: StageOption[], pipelineId: string | null): StageOption[] {
  if (!pipelineId) return stages;
  return stages.filter((s) => s.pipeline_id === pipelineId);
}
