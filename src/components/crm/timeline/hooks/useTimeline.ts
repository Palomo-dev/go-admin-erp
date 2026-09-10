'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import type { TimelineEntry, TimelineEntityType, TimelineQuery } from '@/lib/services/crm/timelineService';
import { allRealtimePublished } from '@/components/crm/shared/realtimeTables';
import { groupByDay, mergeEntries, type DayGroup } from '../utils';

/**
 * useTimeline — consumidor de GET /api/crm/timeline/[type]/[id] (FASE-09 §4.2).
 *
 * - Página 1 al montar / cambiar filtros; `loadMore` con cursor estable.
 * - Realtime: canal `timeline:{type}:{id}` con postgres_changes sobre activities,
 *   calls, email_messages, messages, tasks, notes y opportunity_stage_history
 *   (filtros por id). Al evento: debounce 400 ms → refresca página 1 → merge.
 * - Si el canal falla (CHANNEL_ERROR/TIMED_OUT) → polling cada 15 s.
 *
 * F9-04/F9-29: `notes` NO está en la publicación `supabase_realtime` (el canal
 * entra en SUBSCRIBED y nunca llega un evento de notas). Mientras siga así el
 * modo se reporta como `polling` y el intervalo de 15 s corre SIEMPRE, para que
 * una nota creada en otra pestaña acabe apareciendo sin recargar.
 */

export interface UseTimelineResult {
  entries: TimelineEntry[];
  groups: DayGroup[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => Promise<void>;
  realtime: 'connecting' | 'live' | 'polling';
  newCount: number;
  showNew: () => void;
}

function buildUrl(type: TimelineEntityType, id: string, q: TimelineQuery, cursor?: string | null): string {
  const p = new URLSearchParams();
  if (q.kinds?.length) p.set('kinds', q.kinds.join(','));
  if (q.channels?.length) p.set('channels', q.channels.join(','));
  if (q.userId) p.set('user_id', q.userId);
  if (q.from) p.set('from', q.from);
  if (q.to) p.set('to', q.to);
  p.set('limit', String(q.limit ?? 30));
  if (cursor) p.set('cursor', cursor);
  return `/api/crm/timeline/${type}/${id}?${p.toString()}`;
}

async function fetchPage(url: string): Promise<{ data: TimelineEntry[]; next_cursor: string | null }> {
  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error || `Error ${res.status}`);
  return { data: json.data as TimelineEntry[], next_cursor: json.next_cursor ?? null };
}

/** Tablas que alimentan el timeline. */
const TIMELINE_TABLES = ['activities', 'calls', 'email_messages', 'tasks', 'notes', 'messages', 'opportunity_stage_history'] as const;
const FULLY_LIVE = allRealtimePublished(TIMELINE_TABLES);

export function useTimeline(
  entityType: TimelineEntityType,
  entityId: string | null,
  filters: TimelineQuery = {},
  opts: { pauseNew?: boolean } = {}
): UseTimelineResult {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [pending, setPending] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [realtime, setRealtime] = useState<'connecting' | 'live' | 'polling'>('connecting');
  const filtersKey = JSON.stringify(filters);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const pauseRef = useRef(Boolean(opts.pauseNew));
  pauseRef.current = Boolean(opts.pauseNew);
  const reqSeq = useRef(0);

  const loadFirst = useCallback(async (silent = false) => {
    if (!entityId) return;
    const seq = ++reqSeq.current;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const page = await fetchPage(buildUrl(entityType, entityId, filtersRef.current));
      if (seq !== reqSeq.current) return;
      if (silent) {
        setEntries((prev) => {
          const known = new Set(prev.map((e) => `${e.kind}:${e.id}`));
          const fresh = page.data.filter((e) => !known.has(`${e.kind}:${e.id}`));
          if (pauseRef.current && fresh.length > 0) {
            setPending((p) => mergeEntries(p, fresh));
            // actualiza versiones nuevas de entradas ya visibles sin insertar las nuevas
            return mergeEntries(prev, page.data.filter((e) => known.has(`${e.kind}:${e.id}`)));
          }
          return mergeEntries(prev, page.data);
        });
      } else {
        setEntries(page.data);
        setPending([]);
        setCursor(page.next_cursor);
      }
      if (!silent) setCursor(page.next_cursor);
    } catch (err) {
      if (seq !== reqSeq.current) return;
      setError(err instanceof Error ? err.message : 'Error cargando el timeline');
    } finally {
      if (seq === reqSeq.current && !silent) setLoading(false);
    }
  }, [entityType, entityId]);

  // Carga inicial y por cambio de filtros
  useEffect(() => {
    setEntries([]);
    setCursor(null);
    setPending([]);
    void loadFirst(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadFirst, filtersKey]);

  const loadMore = useCallback(() => {
    if (!entityId || !cursor || loadingMore) return;
    setLoadingMore(true);
    fetchPage(buildUrl(entityType, entityId, filtersRef.current, cursor))
      .then((page) => {
        setEntries((prev) => mergeEntries(prev, page.data));
        setCursor(page.next_cursor);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error cargando más'))
      .finally(() => setLoadingMore(false));
  }, [entityType, entityId, cursor, loadingMore]);

  // Realtime + fallback polling
  useEffect(() => {
    if (!entityId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void loadFirst(true), 400);
    };
    const startPolling = () => {
      setRealtime('polling');
      if (!poll) poll = setInterval(() => void loadFirst(true), 15_000);
    };
    const ch = supabase
      .channel(`timeline:${entityType}:${entityId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities', filter: `related_id=eq.${entityId}` }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: `${entityType === 'opportunity' ? 'opportunity_id' : 'customer_id'}=eq.${entityId}` }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'email_messages', filter: `related_id=eq.${entityId}` }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `related_to_id=eq.${entityId}` }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `related_id=eq.${entityId}` }, bump);
    if (entityType === 'opportunity') {
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `related_opportunity_id=eq.${entityId}` }, bump);
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'opportunity_stage_history', filter: `opportunity_id=eq.${entityId}` }, bump);
    }
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // Solo se promete "live" si TODAS las tablas están publicadas.
        if (FULLY_LIVE) {
          setRealtime('live');
          if (poll) { clearInterval(poll); poll = null; void loadFirst(true); }
        } else {
          startPolling();
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        startPolling();
      }
    });
    if (!FULLY_LIVE) startPolling();
    return () => {
      if (timer) clearTimeout(timer);
      if (poll) clearInterval(poll);
      supabase.removeChannel(ch);
    };
  }, [entityType, entityId, loadFirst]);

  const showNew = useCallback(() => {
    setEntries((prev) => mergeEntries(prev, pending));
    setPending([]);
  }, [pending]);

  const groups = useMemo(() => groupByDay(entries), [entries]);

  return {
    entries,
    groups,
    loading,
    loadingMore,
    error,
    hasMore: Boolean(cursor),
    loadMore,
    refresh: () => loadFirst(true),
    realtime,
    newCount: pending.length,
    showNew,
  };
}
