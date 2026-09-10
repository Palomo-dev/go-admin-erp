'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { opportunitiesService } from '@/components/crm/oportunidades/opportunitiesService';
import { isRealtimePublished } from '@/components/crm/shared/realtimeTables';
import type { Opportunity, CustomerDetails, Stage } from '@/components/crm/oportunidades/types';

/**
 * useOpportunityData — carga granular de la ficha (FASE-09 §4.2):
 * 1 query para la oportunidad (+ customer/stage/pipeline embebidos) al abrir,
 * cliente en detalle y etapas del pipeline por separado; refetch por sección
 * en vez de la tormenta de 7 queries (B14). Realtime en `opportunities`
 * (filter id=eq.) aplica un patch seguro sin refetch.
 */
export type OpportunityFull = Opportunity & {
  temperature?: string | null;
  score_total?: number | null;
  icp_band?: string | null;
  sales_team_id?: string | null;
  territory_id?: string | null;
  loss_reason_value?: string | null;
};

export interface UseOpportunityDataResult {
  opportunity: OpportunityFull | null;
  customer: CustomerDetails | null;
  stages: Stage[];
  loading: boolean;
  error: string | null;
  refetch: {
    opportunity: () => Promise<void>;
    customer: () => Promise<void>;
    stages: () => Promise<void>;
    all: () => Promise<void>;
  };
  patch: (partial: Partial<OpportunityFull>) => void;
}

const SAFE_REALTIME_KEYS = [
  'stage_id', 'amount', 'currency', 'status', 'temperature', 'next_action', 'next_contact_at', 'last_contact_at',
  'contact_channel', 'contact_result', 'salesperson_id', 'expected_close_date', 'name', 'closed_at', 'score_total',
  'icp_band', 'sales_team_id', 'territory_id', 'win_data', 'discovery_data', 'loss_reason', 'metadata',
] as const;

function pickSafe(row: Record<string, unknown>): Partial<OpportunityFull> {
  const out: Record<string, unknown> = {};
  for (const k of SAFE_REALTIME_KEYS) if (k in row) out[k] = row[k];
  return out as Partial<OpportunityFull>;
}

export function useOpportunityData(opportunityId: string | null, opts: { enabled?: boolean } = {}): UseOpportunityDataResult {
  const enabled = opts.enabled ?? true;
  const [opportunity, setOpportunity] = useState<OpportunityFull | null>(null);
  const [customer, setCustomer] = useState<CustomerDetails | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(opportunityId);
  idRef.current = opportunityId;

  const loadOpportunity = useCallback(async () => {
    const id = idRef.current;
    if (!id) return;
    const data = await opportunitiesService.getOpportunityById(id);
    if (idRef.current !== id) return;
    setOpportunity(data as OpportunityFull | null);
    if (!data) setError('Oportunidad no encontrada o sin acceso');
  }, []);

  const loadCustomer = useCallback(async () => {
    const id = idRef.current;
    if (!id) return;
    const custId = opportunity?.customer_id;
    if (!custId) { setCustomer(null); return; }
    const c = await opportunitiesService.getCustomerDetails(custId);
    if (idRef.current === id) setCustomer(c);
  }, [opportunity?.customer_id]);

  const loadStages = useCallback(async () => {
    const pid = opportunity?.pipeline_id;
    if (!pid) return;
    const s = await opportunitiesService.getStages(pid);
    setStages(s);
  }, [opportunity?.pipeline_id]);

  // Carga inicial
  useEffect(() => {
    if (!enabled || !opportunityId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOpportunity(null);
    setCustomer(null);
    (async () => {
      try {
        const data = await opportunitiesService.getOpportunityById(opportunityId);
        if (cancelled) return;
        if (!data) { setError('Oportunidad no encontrada o sin acceso'); return; }
        setOpportunity(data as OpportunityFull);
        const [c, s] = await Promise.allSettled([
          data.customer_id ? opportunitiesService.getCustomerDetails(data.customer_id) : Promise.resolve(null),
          data.pipeline_id ? opportunitiesService.getStages(data.pipeline_id) : Promise.resolve([] as Stage[]),
        ]);
        if (cancelled) return;
        if (c.status === 'fulfilled') setCustomer(c.value);
        if (s.status === 'fulfilled') setStages(s.value);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error cargando la oportunidad');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [opportunityId, enabled]);

  // Realtime: patch de campos seguros.
  // F9-04: `opportunities` NO está en la publicación `supabase_realtime`, así
  // que hoy este canal no recibiría nada; no se abre y el refresco lo hace el
  // drawer llamando a `refetch` tras cada mutación. Cuando DB la publique basta
  // con añadirla en `shared/realtimeTables.ts`.
  useEffect(() => {
    if (!enabled || !opportunityId || !isRealtimePublished('opportunities')) return;
    const ch = supabase
      .channel(`opp:${opportunityId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'opportunities', filter: `id=eq.${opportunityId}` }, (p) => {
        const row = p.new as Record<string, unknown>;
        setOpportunity((prev) => (prev ? { ...prev, ...pickSafe(row) } : prev));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [opportunityId, enabled]);

  const patch = useCallback((partial: Partial<OpportunityFull>) => {
    setOpportunity((prev) => (prev ? { ...prev, ...partial } : prev));
  }, []);

  const all = useCallback(async () => {
    await loadOpportunity();
    await Promise.allSettled([loadCustomer(), loadStages()]);
  }, [loadOpportunity, loadCustomer, loadStages]);

  return { opportunity, customer, stages, loading, error, refetch: { opportunity: loadOpportunity, customer: loadCustomer, stages: loadStages, all }, patch };
}
