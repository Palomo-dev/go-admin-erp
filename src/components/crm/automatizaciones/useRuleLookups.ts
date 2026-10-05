'use client';

/**
 * Catálogos (pipelines, etapas, secuencias, plantillas) en la forma que
 * necesita el traductor a lenguaje humano. Un solo hook para la lista, el
 * editor y la prueba en seco: los nombres se resuelven igual en todas partes.
 */

import { useEffect, useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import { useAutomationText } from './useAutomationText';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { fetchJson } from '@/lib/utils/fetchJson';
import { useCrmLookups, type CrmLookupsState } from '@/components/crm/shared/useCrmLookups';
import type { HumanizerLookups } from '@/lib/services/crm/automation/ruleHumanizer';

export interface RuleLookups extends CrmLookupsState {
  humanizer: HumanizerLookups;
  agents?: { id: string; name: string }[];
  agentError?: string | null;
}

function byId<T extends { id: string; name: string }>(items: T[]): (id: string) => string | null {
  const map = new Map(items.map((i) => [i.id, i.name]));
  return (id) => map.get(id) ?? null;
}

export function useRuleLookups(): RuleLookups {
  const text = useAutomationText(), locale = useLocale();
  const { organization } = useOrganization(); const orgId = organization?.id ?? null;
  const [agentState, setAgentState] = useState<{ scope:number | null; rows:{ id:string; name:string }[]; error:string | null }>({ scope:null, rows:[], error:null });
  useEffect(() => {
    if (!orgId) return;
    const abort = new AbortController(); let alive = true;
    fetchJson<{ data:{ id:string; name:string; is_active:boolean }[] }>('/api/crm/voice-agents', { signal:abort.signal, timeoutMs:10000 }).then(result => {
      if (alive) setAgentState({ scope:orgId, rows:result.data.filter(row => row.is_active).map(({id,name}) => ({id,name})), error:null });
    }).catch(() => { if (alive) setAgentState({ scope:orgId, rows:[], error:'No se pudieron cargar los agentes de voz.' }); });
    return () => { alive = false; abort.abort(); };
  },[orgId]);
  const state = useCrmLookups();
  const humanizer = useMemo<HumanizerLookups>(() => ({
    text, locale,
    stageName: byId(state.stages),
    pipelineName: byId(state.pipelines),
    sequenceName: byId(state.sequences),
    templateName: byId(state.templates),
  }), [state.stages, state.pipelines, state.sequences, state.templates, text, locale]);
  return { ...state, humanizer, agents:agentState.scope === orgId ? agentState.rows : [], agentError:agentState.scope === orgId ? agentState.error : null };
}
