'use client';

/**
 * CallRowDetail — contenido de la fila expandida en CallsTable (FASE-04 §5.2):
 * reproductor completo + transcripción (clic → seek) + análisis IA.
 * En < 768 px muestra pestañas; en escritorio dos columnas.
 */

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CallPlayer } from './CallPlayer';
import { CallLinkPanel } from './CallLinkPanel';
import {
  CallTranscriptPanel,
  CallAnalysisPanel,
  useCallIntelligence,
} from '@/components/crm/calls';
import type { CallListRow, CallRecord } from '@/lib/services/crm/callManagementService';

export type HistoricalCallDetail = CallRecord &
  Pick<CallListRow, 'recordings'> &
  Partial<Pick<CallListRow, 'customer' | 'consent_method'>>;
interface CallRowDetailProps {
  call: HistoricalCallDetail;
  initialSeekMs?: number | null;
}

export function CallRowDetail({ call, initialSeekMs = null }: CallRowDetailProps) {
  const t = useTranslations('crm.llamadas');
  const state = useCallIntelligence(call.id, true);
  const [seekToMs, setSeekToMs] = useState<number | null>(initialSeekMs);
  const [currentMs, setCurrentMs] = useState(initialSeekMs ?? 0);
  const [linkVersion, setLinkVersion] = useState(0);
  const onSeek = useCallback((ms: number) => setSeekToMs(ms + 0.001 * Math.random()), []); // valor distinto en cada clic
  const onTime = useCallback((ms: number) => setCurrentMs(ms), []);

  // Número al que se llamó (para pre-llenar al crear cliente)
  const phoneNumber = call.direction === 'inbound' ? call.from_number : call.to_number;
  const customerName = call.customer
    ? [call.customer.first_name, call.customer.last_name].filter(Boolean).join(' ') ||
      call.customer.full_name ||
      null
    : null;

  return (
    <div className="space-y-3 bg-subtle p-3">
      {/* Panel de vinculación: aparece si falta cliente o oportunidad */}
      <CallLinkPanel
        key={`link-${linkVersion}`}
        callId={call.id}
        customerId={call.customer_id}
        opportunityId={call.opportunity_id}
        phoneNumber={phoneNumber}
        customerName={customerName}
        onLinked={() => setLinkVersion((v) => v + 1)}
      />
      <CallPlayer
        callId={call.id}
        recordingEnabled={
          call.recording_enabled || call.recordings.some((r) => r.status === 'ready')
        }
        consentMethod={call.consent_method}
        variant="full"
        seekToMs={seekToMs}
        onTimeUpdate={onTime}
      />
      <div className="hidden gap-3 md:grid md:grid-cols-2">
        <CallTranscriptPanel callId={call.id} state={state} onSeek={onSeek} currentMs={currentMs} />
        <CallAnalysisPanel callId={call.id} state={state} opportunityId={call.opportunity_id} />
      </div>
      <Tabs defaultValue="transcript" className="md:hidden">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="transcript">{t('transcripcion')}</TabsTrigger>
          <TabsTrigger value="analysis">{t('analisis')}</TabsTrigger>
        </TabsList>
        <TabsContent value="transcript">
          <CallTranscriptPanel
            callId={call.id}
            state={state}
            onSeek={onSeek}
            currentMs={currentMs}
          />
        </TabsContent>
        <TabsContent value="analysis">
          <CallAnalysisPanel callId={call.id} state={state} opportunityId={call.opportunity_id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default CallRowDetail;
