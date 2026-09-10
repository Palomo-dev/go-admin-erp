'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { subscribeToOpportunities, subscribeToStages, type RealtimeSubscription } from '@/lib/services/realtimeService';
import { allRealtimePublished, PIPELINE_REFRESH_EVENT } from '@/components/crm/shared/realtimeTables';
import { requestStageChange, type StageChangeResult } from '../drawer/StageSelect';

/**
 * useKanbanBoard — datos del tablero (FASE-09 §5.2): etapas + oportunidades
 * del pipeline en 2 queries, realtime (stages + opportunities de la org con
 * merge por columna), movimiento optimista con revert y cambio de etapa vía
 * PATCH /api/crm/opportunities/[id]/stage (gate/won/lost los resuelve el board).
 *
 * F9-04: `opportunities` y `stages` NO están en la publicación
 * `supabase_realtime`, así que la suscripción entra en SUBSCRIBED y no llega
 * nada. Mientras DB no las publique el modo real es `polling`:
 * refresco cada `POLL_MS` + evento `refresh-pipeline-data` que emiten el drawer
 * y los diálogos tras cada mutación. `mode` refleja la verdad para que el chip
 * de la cabecera no mienta.
 */
export interface KanbanStage {
  id: string;
  name: string;
  position: number;
  pipeline_id: string;
  probability?: number | null;
  color?: string | null;
  description?: string | null;
  is_won?: boolean | null;
  is_lost?: boolean | null;
}

export interface KanbanOpportunity {
  id: string;
  name: string;
  stage_id: string;
  customer_id: string | null;
  amount: number | null;
  currency: string | null;
  expected_close_date: string | null;
  status: string | null;
  temperature?: string | null;
  next_action?: string | null;
  next_contact_at?: string | null;
  last_contact_at?: string | null;
  contact_channel?: string | null;
  score_total?: number | null;
  icp_band?: string | null;
  salesperson_id?: string | null;
  updated_at?: string | null;
  customer?: { id: string; full_name: string; email?: string | null; phone?: string | null; avatar_url?: string | null } | null;
  salesperson?: { id: string; first_name?: string | null; last_name?: string | null; avatar_url?: string | null } | null;
}

const OPP_SELECT =
  'id, name, stage_id, customer_id, amount, currency, expected_close_date, status, temperature, next_action, next_contact_at, last_contact_at, contact_channel, score_total, icp_band, salesperson_id, updated_at, ' +
  'customer:customers!customer_id(id, full_name, email, phone, avatar_url), salesperson:profiles!salesperson_id(id, first_name, last_name, avatar_url)';

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

function normalize(row: Record<string, unknown>): KanbanOpportunity {
  return {
    ...(row as unknown as KanbanOpportunity),
    amount: row.amount != null ? Number(row.amount) : null,
    customer: one(row.customer as KanbanOpportunity['customer']),
    salesperson: one(row.salesperson as KanbanOpportunity['salesperson']),
  };
}

/** Tablas de las que depende el tablero. */
const BOARD_TABLES = ['opportunities', 'stages'] as const;
const POLL_MS = 30_000;
/** Ventana de agrupación del evento `refresh-pipeline-data` (F9-39). */
const REFRESH_DEBOUNCE_MS = 400;
/** Hoy es false: ninguna de las dos tablas está publicada (ver realtimeTables.ts). */
const LIVE_CAPABLE = allRealtimePublished(BOARD_TABLES);

export type BoardRealtimeMode = 'live' | 'polling' | 'off';

export function useKanbanBoard(pipelineId: string | null) {
  const [stages, setStages] = useState<KanbanStage[]>([]);
  const [opps, setOpps] = useState<KanbanOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeOn, setRealtimeOn] = useState(true);
  const draggingRef = useRef<string | null>(null);
  const subsRef = useRef<RealtimeSubscription[]>([]);

  const loadStages = useCallback(async () => {
    if (!pipelineId) return;
    const { data, error: e } = await supabase
      .from('stages')
      .select('id, name, position, pipeline_id, probability, color, description, is_won, is_lost')
      .eq('pipeline_id', pipelineId)
      .order('position');
    if (e) throw e;
    setStages((data ?? []) as KanbanStage[]);
  }, [pipelineId]);

  const loadOpportunities = useCallback(async () => {
    if (!pipelineId) return;
    const orgId = getOrganizationId();
    let q = supabase.from('opportunities').select(OPP_SELECT).eq('pipeline_id', pipelineId).in('status', ['open', 'won', 'lost']).order('updated_at', { ascending: false });
    if (orgId) q = q.eq('organization_id', orgId);
    const { data, error: e } = await q;
    if (e) throw e;
    setOpps(((data ?? []) as unknown as Record<string, unknown>[]).map(normalize));
  }, [pipelineId]);

  const refetchAll = useCallback(async () => {
    if (!pipelineId) return;
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadStages(), loadOpportunities()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando el pipeline');
    } finally {
      setLoading(false);
    }
  }, [pipelineId, loadStages, loadOpportunities]);

  useEffect(() => { void refetchAll(); }, [refetchAll]);

  // F9-04: refresco por evento (drawer, diálogos, formularios) — siempre activo.
  // F9-39: amortiguado. Cada evento costaba DOS consultas del pipeline completo
  // (`loadOpportunities` + `loadStages`) sin agrupar, así que una ráfaga de
  // acciones desde el drawer multiplicaba las consultas sobre el sondeo de 30 s.
  // Con la ventana de `REFRESH_DEBOUNCE_MS` una ráfaga cuesta una sola recarga.
  useEffect(() => {
    if (!pipelineId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void loadOpportunities();
        void loadStages();
      }, REFRESH_DEBOUNCE_MS);
    };
    window.addEventListener(PIPELINE_REFRESH_EVENT, onRefresh);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(PIPELINE_REFRESH_EVENT, onRefresh);
    };
  }, [pipelineId, loadOpportunities, loadStages]);

  // F9-04: sin publicación realtime → polling honesto en vez de chip verde falso
  useEffect(() => {
    if (!pipelineId || !realtimeOn || LIVE_CAPABLE) return;
    const t = setInterval(() => { void loadOpportunities(); }, POLL_MS);
    return () => clearInterval(t);
  }, [pipelineId, realtimeOn, loadOpportunities]);

  // Realtime (solo si las tablas están publicadas)
  useEffect(() => {
    subsRef.current.forEach((s) => s.unsubscribe());
    subsRef.current = [];
    if (!pipelineId || !realtimeOn || !LIVE_CAPABLE) return;
    const upsert = (row: Record<string, unknown>) => {
      const id = row.id as string;
      if (draggingRef.current === id) return;
      setOpps((prev) => {
        const idx = prev.findIndex((o) => o.id === id);
        if (idx === -1) {
          if (row.pipeline_id && row.pipeline_id !== pipelineId) return prev;
          // fila nueva: refrescar con joins
          supabase.from('opportunities').select(OPP_SELECT).eq('id', id).maybeSingle().then(({ data }) => {
            const fresh = data as unknown as Record<string, unknown> | null;
            if (fresh) setOpps((p) => (p.some((o) => o.id === id) ? p : [normalize(fresh), ...p]));
          });
          return prev;
        }
        const merged = { ...prev[idx] };
        for (const k of ['name', 'stage_id', 'amount', 'currency', 'expected_close_date', 'status', 'temperature', 'next_action', 'next_contact_at', 'last_contact_at', 'contact_channel', 'score_total', 'icp_band', 'salesperson_id', 'customer_id', 'updated_at'] as const) {
          if (k in row) (merged as Record<string, unknown>)[k] = k === 'amount' && row[k] != null ? Number(row[k]) : row[k];
        }
        const next = [...prev];
        next[idx] = merged;
        return next;
      });
    };
    const remove = (row: Record<string, unknown>) => setOpps((prev) => prev.filter((o) => o.id !== row.id));
    const stageSub = subscribeToStages(pipelineId, {
      onInsert: () => void loadStages(),
      onUpdate: (s) => setStages((prev) => prev.map((x) => (x.id === s.id ? { ...x, ...(s as Partial<KanbanStage>) } : x))),
      onDelete: (s) => setStages((prev) => prev.filter((x) => x.id !== s.id)),
    });
    // subscribeToOpportunities filtra por stage; suscribimos por columna
    const oppSubs = stages.map((st) => subscribeToOpportunities(st.id, {
      onInsert: (o) => upsert(o as Record<string, unknown>),
      onUpdate: (o) => upsert(o as Record<string, unknown>),
      onDelete: (o) => remove(o as Record<string, unknown>),
    }));
    subsRef.current = [stageSub, ...oppSubs];
    return () => { subsRef.current.forEach((s) => s.unsubscribe()); subsRef.current = []; };
  }, [pipelineId, realtimeOn, stages, loadStages]);

  const byStage = useMemo(() => {
    const map: Record<string, KanbanOpportunity[]> = {};
    for (const s of stages) map[s.id] = [];
    for (const o of opps) (map[o.stage_id] ??= []).push(o);
    return map;
  }, [stages, opps]);

  const stats = useMemo(() => {
    const out: Record<string, { count: number; total: number }> = {};
    for (const s of stages) {
      const list = byStage[s.id] ?? [];
      out[s.id] = { count: list.length, total: list.reduce((sum, o) => sum + (o.amount ?? 0), 0) };
    }
    return out;
  }, [stages, byStage]);

  /** Mueve localmente y devuelve revert(). */
  const moveOptimistic = useCallback((oppId: string, toStageId: string, status?: string | null) => {
    let previous: KanbanOpportunity | undefined;
    setOpps((prev) => prev.map((o) => {
      if (o.id !== oppId) return o;
      previous = o;
      return { ...o, stage_id: toStageId, ...(status !== undefined ? { status } : {}) };
    }));
    return () => { if (previous) setOpps((prev) => prev.map((o) => (o.id === oppId ? previous! : o))); };
  }, []);

  const changeStage = useCallback(async (oppId: string, stageId: string, opts?: { override?: boolean; wonData?: Record<string, unknown>; lossData?: Record<string, unknown> }): Promise<StageChangeResult> => {
    draggingRef.current = oppId;
    try {
      const r = await requestStageChange(oppId, { stage_id: stageId, override: opts?.override, won_data: opts?.wonData, loss_data: opts?.lossData });
      if (r.ok) {
        const row = r.opportunity as Record<string, unknown>;
        setOpps((prev) => prev.map((o) => (o.id === oppId ? { ...o, stage_id: (row.stage_id as string) ?? stageId, status: (row.status as string) ?? o.status, updated_at: (row.updated_at as string) ?? o.updated_at } : o)));
      }
      return r;
    } finally {
      setTimeout(() => { if (draggingRef.current === oppId) draggingRef.current = null; }, 1500);
    }
  }, []);

  const mode: BoardRealtimeMode = !realtimeOn ? 'off' : LIVE_CAPABLE ? 'live' : 'polling';

  const upsertStageLocal = useCallback((s: KanbanStage) => setStages((prev) => (prev.some((x) => x.id === s.id) ? prev.map((x) => (x.id === s.id ? { ...x, ...s } : x)) : [...prev, s].sort((a, b) => a.position - b.position))), []);
  const removeStageLocal = useCallback((id: string) => setStages((prev) => prev.filter((x) => x.id !== id)), []);
  const setStagesLocal = useCallback((list: KanbanStage[]) => setStages(list), []);

  return { stages, opportunities: byStage, stats, loading, error, realtimeOn, setRealtimeOn, mode, moveOptimistic, changeStage, refetchAll, refetchOpportunities: loadOpportunities, refetchStages: loadStages, upsertStageLocal, removeStageLocal, setStagesLocal, draggingRef };
}

export type UseKanbanBoardResult = ReturnType<typeof useKanbanBoard>;
