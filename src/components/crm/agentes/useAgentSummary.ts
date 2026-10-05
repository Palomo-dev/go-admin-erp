'use client';
import { useEffect, useRef, useState } from 'react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { VoiceAgentMetrics } from '@/lib/services/crm/voiceAgentMetrics';
const SUMMARY_TTL = 60_000;
export interface AgentSummary { period: VoiceAgentMetrics | null; month: VoiceAgentMetrics | null; }
/** Lecturas pequeñas sobre la RPC existente, sin filas de llamadas ni consultas del navegador a tablas. */
export function useAgentSummary(ids: readonly string[], revision = 0) {
  // Hasta doce tarjetas por carga: la lista completa nunca provoca fan-out sin límite.
  const cache = useRef(new Map<string, { until: number; value: AgentSummary }>());
  const key = ids.slice(0, 12).join(','), scope = getOrganizationId();
  const previousRevision = useRef(revision);
  const [summaries, setSummaries] = useState<Record<string, AgentSummary>>({});
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (previousRevision.current !== revision) { cache.current.clear(); previousRevision.current = revision; }
    const agentIds = key ? key.split(',') : [];
    setSummaries({}); setLoading(agentIds.length > 0);
    if (!agentIds.length) return;
    const controller = new AbortController(); let current = true, cursor = 0;
    const next: Record<string, AgentSummary> = {};
    const read = async (id: string, period: '7d' | '30d') => {
      try { return (await pedirCrm<VoiceAgentMetrics>(`/api/crm/voice-agents/${encodeURIComponent(id)}/metrics?periodo=${period}&limit=1`, { signal: controller.signal })).data; }
      catch { return null; }
    };
    const worker = async () => {
      while (current && cursor < agentIds.length) {
        const id = agentIds[cursor++], cacheKey = `${scope}:${id}`;
        const cached = cache.current.get(cacheKey);
        if (scope && cached && cached.until > Date.now()) { next[id] = cached.value; continue; }
        const period = await read(id, '7d');
        if (!current) return;
        const month = await read(id, '30d');
        if (!current) return;
        next[id] = { period, month };
        if (scope && period && month) cache.current.set(cacheKey, { until: Date.now() + SUMMARY_TTL, value: next[id] });
      }
    };
    void Promise.all(Array.from({ length: Math.min(4, agentIds.length) }, worker)).then(() => { if (current) { setSummaries(next); setLoading(false); } });
    return () => { current = false; controller.abort(); };
  }, [key, scope, revision]);
  return { summaries, loading };
}
export function bookedMeetings(value: VoiceAgentMetrics): number {
  return value.tools.filter(tool => tool.tool === 'book_meeting' && tool.status === 'applied').reduce((total, tool) => total + tool.total, 0);
}
/** Un agregado incompleto se omite: un error de lectura no se convierte en cero. */
export function completeAgentSummary(ids: readonly string[], values: Record<string, AgentSummary>) {
  if (!ids.length || ids.some(id => !values[id]?.period || !values[id]?.month)) return null;
  return ids.reduce((total, id) => {
    const value = values[id];
    return { calls: total.calls + value.period!.total, effective: total.effective + value.period!.effective, meetings: total.meetings + bookedMeetings(value.period!), credits: total.credits + value.month!.credits_consumed };
  }, { calls: 0, effective: 0, meetings: 0, credits: 0 });
}
