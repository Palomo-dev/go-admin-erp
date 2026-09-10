'use client';

/**
 * CallRowDetail — contenido de la fila expandida en CallsTable (FASE-04 §5.2):
 * reproductor completo + transcripción (clic → seek) + análisis IA.
 * En < 768 px muestra pestañas; en escritorio dos columnas.
 */

import { useState, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CallPlayer } from './CallPlayer';
import { CallTranscriptPanel, CallAnalysisPanel, useCallIntelligence } from '@/components/crm/calls';

interface CallRowDetailProps {
  callId: string;
  recordingEnabled: boolean;
  opportunityId?: string | null;
}

export function CallRowDetail({ callId, recordingEnabled, opportunityId }: CallRowDetailProps) {
  const state = useCallIntelligence(callId, true);
  const [seekToMs, setSeekToMs] = useState<number | null>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const onSeek = useCallback((ms: number) => setSeekToMs(ms + 0.001 * Math.random()), []); // valor distinto en cada clic
  const onTime = useCallback((ms: number) => setCurrentMs(ms), []);

  return (
    <div className="space-y-3 bg-gray-50 p-3 dark:bg-gray-900/60">
      <CallPlayer callId={callId} recordingEnabled={recordingEnabled} variant="full" seekToMs={seekToMs} onTimeUpdate={onTime} />
      <div className="hidden gap-3 md:grid md:grid-cols-2">
        <CallTranscriptPanel callId={callId} state={state} onSeek={onSeek} currentMs={currentMs} />
        <CallAnalysisPanel callId={callId} state={state} opportunityId={opportunityId} />
      </div>
      <Tabs defaultValue="transcript" className="md:hidden">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="transcript">Transcripción</TabsTrigger>
          <TabsTrigger value="analysis">Análisis IA</TabsTrigger>
        </TabsList>
        <TabsContent value="transcript">
          <CallTranscriptPanel callId={callId} state={state} onSeek={onSeek} currentMs={currentMs} />
        </TabsContent>
        <TabsContent value="analysis">
          <CallAnalysisPanel callId={callId} state={state} opportunityId={opportunityId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default CallRowDetail;
