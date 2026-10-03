'use client';

import { useEffect, useRef, useState } from 'react';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { VoiceAgentCampaign } from '@/lib/services/crm/voiceAgentService';
import type { voiceCampaignCreateSchema } from '@/lib/services/crm/voiceCampaignWriteLogica';

export type BorradorVoz = typeof voiceCampaignCreateSchema._type;

/** Versiones de las respuestas propias y una sola intención en curso, igual que el borrador de mensajes. */
export function useBorradorCampanaVoz(body: BorradorVoz) {
  const current = useRef<VoiceAgentCampaign | null>(null);
  const active = useRef(true);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const [saved, setSaved] = useState<VoiceAgentCampaign | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const signature = JSON.stringify(body);
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort(); }; }, []);
  const accept = (value: VoiceAgentCampaign) => {
    if (!value.id || !value.updated_at || !Number.isFinite(Date.parse(value.updated_at))) throw new Error('invalid_version');
    current.current = value;
    if (active.current) setSaved(value);
  };
  const save = async () => {
    const previous = current.current;
    const response = await pedirCrm<VoiceAgentCampaign>(`/api/crm/voice-agents/campaigns${previous ? `/${previous.id}` : ''}`, {
      method: previous ? 'PATCH' : 'POST', signal: controller.current?.signal,
      cuerpo: { ...body, status: 'draft', ...(previous ? { expected_updated_at: previous.updated_at } : {}) },
    });
    accept(response.data);
    if (active.current) setSavedSignature(signature);
    return response.data;
  };
  const run = async (activate: boolean) => {
    if (inFlight.current) throw new Error('busy');
    inFlight.current = true; setBusy(true); controller.current = new AbortController();
    try {
      const draft = await save();
      if (!active.current) throw new Error('cancelled');
      if (!activate) return draft;
      const response = await pedirCrm<VoiceAgentCampaign>(`/api/crm/voice-agents/campaigns/${draft.id}`, {
        method: 'PATCH', signal: controller.current.signal,
        cuerpo: { status: 'running', emergency_stop: false, expected_updated_at: draft.updated_at },
      });
      accept(response.data);
      return response.data;
    } finally { inFlight.current = false; if (active.current) setBusy(false); }
  };
  const applyRneVersion = (version: string) => {
    if (!current.current || !Number.isFinite(Date.parse(version))) throw new Error('invalid_version');
    accept({ ...current.current, updated_at: version });
  };
  return { saved, busy, unchanged: savedSignature === signature, guardar: () => run(false), lanzar: () => run(true), applyRneVersion };
}
