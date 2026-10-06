'use client';

/**
 * CallRowDetail — contenido de la hoja de detalle de CallsTable (FASE-04 §5.2,
 * Figma 1363:20):
 * reproductor completo + transcripción (clic → seek) + análisis IA.
 * En < 768 px muestra pestañas (`TabBar` sm del kit: dos secciones de la
 * llamada, regla de pestañas 2026-10-06); en escritorio dos columnas.
 */

import { useState, useCallback } from 'react';
import { idPanel, idPestana, TabBar } from '@/components/kit/TabBar';
import { CallPlayer } from './CallPlayer';
import { CallLinkPanel } from './CallLinkPanel';
import { CallTranscriptPanel, CallAnalysisPanel, useCallIntelligence } from '@/components/crm/calls';
import type { CallListRow } from '@/lib/services/crm/callManagementService';

interface CallRowDetailProps {
  call: CallListRow;
}

export function CallRowDetail({ call }: CallRowDetailProps) {
  const state = useCallIntelligence(call.id, true);
  const [seekToMs, setSeekToMs] = useState<number | null>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [linkVersion, setLinkVersion] = useState(0);
  const [seccion, setSeccion] = useState<'transcript' | 'analysis'>('transcript');
  const idTabs = `llamada-${call.id}`;
  const onSeek = useCallback((ms: number) => setSeekToMs(ms + 0.001 * Math.random()), []); // valor distinto en cada clic
  const onTime = useCallback((ms: number) => setCurrentMs(ms), []);

  // Número al que se llamó (para pre-llenar al crear cliente)
  const phoneNumber = call.direction === 'inbound' ? call.from_number : call.to_number;
  const customerName = call.customer
    ? [call.customer.first_name, call.customer.last_name].filter(Boolean).join(' ') || call.customer.full_name || null
    : null;

  return (
    <div className="space-y-3">
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
      <CallPlayer callId={call.id} recordingEnabled={call.recording_enabled} consentMethod={call.consent_method} variant="full" seekToMs={seekToMs} onTimeUpdate={onTime} />
      <div className="hidden gap-3 md:grid md:grid-cols-2">
        <CallTranscriptPanel callId={call.id} state={state} onSeek={onSeek} currentMs={currentMs} />
        <CallAnalysisPanel callId={call.id} state={state} opportunityId={call.opportunity_id} />
      </div>
      <div className="md:hidden">
        <TabBar
          id={idTabs}
          etiqueta="Secciones de la llamada"
          tamano="sm"
          valor={seccion}
          onValorChange={setSeccion}
          pestanas={[
            { valor: 'transcript', etiqueta: 'Transcripción' },
            { valor: 'analysis', etiqueta: 'Análisis IA' },
          ]}
        />
        <div role="tabpanel" id={idPanel(idTabs, seccion)} aria-labelledby={idPestana(idTabs, seccion)} className="pt-2">
          {seccion === 'transcript' ? (
            <CallTranscriptPanel callId={call.id} state={state} onSeek={onSeek} currentMs={currentMs} />
          ) : (
            <CallAnalysisPanel callId={call.id} state={state} opportunityId={call.opportunity_id} />
          )}
        </div>
      </div>
    </div>
  );
}

export default CallRowDetail;
