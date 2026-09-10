'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useCallIntelligence } from '@/components/crm/calls/useCallIntelligence';
import { CallTranscriptPanel } from '@/components/crm/calls/CallTranscriptPanel';
import { CallAnalysisPanel } from '@/components/crm/calls/CallAnalysisPanel';

/**
 * Transcripción + Análisis de una llamada con UN SOLO `useCallIntelligence`
 * (F9-25): antes cada panel creaba el suyo y una llamada con las dos secciones
 * abiertas hacía doble fetch de `/transcript` y `/analysis`, con doble polling.
 *
 * Este módulo importa F4 de forma estática a propósito: `CallEntry` lo carga
 * con `next/dynamic(...).catch(fallback)`, así que si `@/components/crm/calls`
 * no estuviera disponible el import falla y se usa el panel mínimo propio —
 * el mismo contrato de degradación que ya tenía la entrada de llamada.
 */
export interface CallIntelligenceSectionsProps {
  callId: string;
  opportunityId?: string | null;
  currentMs?: number | null;
  onSeek?: (ms: number) => void;
  transcriptStatus?: string | null;
  onApplied?: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white" aria-expanded={open}>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1.5 pl-1">{open && children}</CollapsibleContent>
    </Collapsible>
  );
}

export function CallIntelligenceSections({ callId, opportunityId, currentMs, onSeek, transcriptStatus, onApplied }: CallIntelligenceSectionsProps) {
  const state = useCallIntelligence(callId);
  return (
    <div className="flex flex-col gap-1.5 pt-1 border-t border-dashed border-gray-200 dark:border-gray-700">
      <Section title={`Transcripción${transcriptStatus ? ` (${transcriptStatus})` : ''}`}>
        <CallTranscriptPanel callId={callId} state={state} currentMs={currentMs} onSeek={onSeek} />
      </Section>
      <Section title="Análisis IA">
        <CallAnalysisPanel callId={callId} opportunityId={opportunityId ?? null} state={state} onApplied={onApplied} />
      </Section>
    </div>
  );
}

export default CallIntelligenceSections;
