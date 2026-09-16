'use client';

/**
 * Catálogos (pipelines, etapas, secuencias, plantillas) en la forma que
 * necesita el traductor a lenguaje humano. Un solo hook para la lista, el
 * editor y la prueba en seco: los nombres se resuelven igual en todas partes.
 */

import { useMemo } from 'react';
import { useCrmLookups, type CrmLookupsState } from '@/components/crm/shared/useCrmLookups';
import type { HumanizerLookups } from '@/lib/services/crm/automation/ruleHumanizer';

export interface RuleLookups extends CrmLookupsState {
  humanizer: HumanizerLookups;
}

function byId<T extends { id: string; name: string }>(items: T[]): (id: string) => string | null {
  const map = new Map(items.map((i) => [i.id, i.name]));
  return (id) => map.get(id) ?? null;
}

export function useRuleLookups(): RuleLookups {
  const state = useCrmLookups();
  const humanizer = useMemo<HumanizerLookups>(() => ({
    stageName: byId(state.stages),
    pipelineName: byId(state.pipelines),
    sequenceName: byId(state.sequences),
    templateName: byId(state.templates),
  }), [state.stages, state.pipelines, state.sequences, state.templates]);
  return { ...state, humanizer };
}
