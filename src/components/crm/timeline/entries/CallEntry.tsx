'use client';

import { useState, type ComponentType } from 'react';
import dynamic from 'next/dynamic';
import { ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CallPlayer } from '@/components/voice/CallPlayer';
import { HtmlContentRenderer } from '@/components/shared/HtmlContentRenderer';
import { cn } from '@/utils/Utils';
import type { TimelineEntry } from '@/lib/services/crm/timelineService';
import { formatDuration } from '../utils';
import { AnalysisPanel, SentimentBadge, TranscriptPanel } from './CallPanels';
import type { EntryAction } from '../TimelineEntryCard';

/**
 * CallEntry — dirección/estado/duración/resultado, CallPlayer (F3) y paneles
 * colapsables de transcripción y análisis. Los paneles completos son de F4
 * (`@/components/crm/calls`) y se cargan con next/dynamic; si el módulo no
 * está disponible se usa el fallback mínimo de `CallPanels.tsx`.
 */
type CallLike = Extract<TimelineEntry, { kind: 'call' | 'call_live' }>;

const PanelLoading = () => <p className="text-xs text-gray-500 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Cargando…</p>;

type SectionsProps = {
  callId: string;
  opportunityId?: string | null;
  currentMs?: number | null;
  onSeek?: (ms: number) => void;
  transcriptStatus?: string | null;
  onApplied?: () => void;
};

/**
 * F9-25: un único contenedor con UN `useCallIntelligence` para las dos
 * secciones (antes cada panel creaba el suyo → doble fetch y doble polling por
 * llamada expandida). Si F4 no está disponible se cae al panel mínimo propio.
 */
const F4CallSections = dynamic<SectionsProps>(
  () => import('./CallIntelligenceSections').then((m) => m.CallIntelligenceSections as ComponentType<SectionsProps>).catch(() => FallbackSections),
  { ssr: false, loading: PanelLoading }
);

/** Fallback sin F4: paneles mínimos, cada uno con su propio fetch. */
function FallbackSections({ callId, transcriptStatus }: SectionsProps) {
  return (
    <>
      <Section title={`Transcripción${transcriptStatus ? ` (${transcriptStatus})` : ''}`}>
        <TranscriptPanel callId={callId} />
      </Section>
      <Section title="Análisis IA">
        <AnalysisPanel callId={callId} />
      </Section>
    </>
  );
}

const STATUS_LABEL: Record<string, string> = {
  dialing: 'Marcando', ringing: 'Timbrando', in_progress: 'En curso', completed: 'Completada', failed: 'Fallida',
  busy: 'Ocupado', no_answer: 'Sin respuesta', canceled: 'Cancelada', voicemail: 'Buzón',
};
const MODE_LABEL: Record<string, string> = { browser: 'navegador', bridge: 'celular', ai_agent: 'agente IA', manual: 'manual', inbound: 'entrante' };
const OUTCOME_LABEL: Record<string, string> = {
  reached: 'Contactado', no_answer: 'Sin respuesta', left_voicemail: 'Buzón', callback_scheduled: 'Callback', qualified: 'Calificado', not_interested: 'No interesado', objection: 'Objeción',
};

function Section({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
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

export function CallEntry({ entry, compact, opportunityId, onAction }: { entry: CallLike; compact?: boolean; opportunityId?: string; onAction?: (a: EntryAction, e: TimelineEntry) => void }) {
  const { call, activity } = entry;
  const [seekMs, setSeekMs] = useState<number | null>(null);
  const [currentMs, setCurrentMs] = useState<number | null>(null);
  const live = entry.kind === 'call_live';
  const inbound = call.direction === 'inbound';
  const Dir = inbound ? ArrowDownLeft : ArrowUpRight;
  const duration = call.duration_seconds ?? activity?.duration_seconds ?? null;
  const analysis = call.analysis;
  const number = inbound ? call.from_number : call.to_number;
  const hasRecording = !live && call.recording_enabled && call.recording?.status !== 'deleted';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span className="font-medium text-gray-900 dark:text-gray-100 inline-flex items-center gap-1">
          <Dir className={cn('h-3.5 w-3.5', inbound ? 'text-blue-500' : 'text-green-500')} />
          Llamada {inbound ? 'entrante' : 'saliente'}
        </span>
        {call.mode && <Badge variant="outline" className="text-[11px]">{MODE_LABEL[call.mode] ?? call.mode}</Badge>}
        <Badge variant={live ? 'info' : call.status === 'completed' ? 'success' : ['failed', 'busy', 'no_answer'].includes(call.status) ? 'warning' : 'secondary'} className="text-[11px]">
          {live && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
          {STATUS_LABEL[call.status] ?? call.status}
        </Badge>
        {duration != null && duration > 0 && <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">{formatDuration(duration)}</span>}
        {activity?.outcome && <Badge variant="secondary" className="text-[11px]">{OUTCOME_LABEL[activity.outcome] ?? activity.outcome}</Badge>}
        {number && <span className="text-xs text-gray-400">{number}</span>}
        {analysis && <SentimentBadge sentiment={analysis.sentiment} score={analysis.quality_score} />}
      </div>

      {hasRecording && (
        <CallPlayer callId={call.id} recordingEnabled={call.recording_enabled} className="max-w-md" seekToMs={seekMs} onTimeUpdate={setCurrentMs} />
      )}

      {analysis?.summary && !compact && (
        <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-3">{analysis.summary}</p>
      )}
      {activity?.notes && !analysis?.summary && (
        <HtmlContentRenderer html={activity.notes} collapsible className="text-sm text-gray-700 dark:text-gray-300" />
      )}

      {!live && call.mode !== 'manual' && (
        <F4CallSections
          callId={call.id}
          opportunityId={opportunityId ?? null}
          currentMs={currentMs}
          onSeek={hasRecording ? setSeekMs : undefined}
          transcriptStatus={call.transcript?.status ?? null}
          onApplied={() => onAction?.('apply_analysis', entry)}
        />
      )}
    </div>
  );
}
