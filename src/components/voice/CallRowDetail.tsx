'use client';

/**
 * CallRowDetail — contenido de la fila expandida en CallsTable (FASE-04 §5.2):
 * reproductor completo + transcripción (clic → seek) + análisis IA.
 * Ficha adaptable: una secuencia móvil; dos columnas desde 1024 px.
 */

import { useState, useCallback, type ReactNode } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { FormSection } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { toast } from '@/components/ui/use-toast';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
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
  Partial<Pick<CallListRow, 'customer' | 'consent_method' | 'user'>> & {
    consents?: { consent_type: string; method: string }[];
    opportunity?: { id: string; name: string; amount?: number | null; currency?: string | null; etapa?: { name: string } | null } | null;
  };
interface CallRowDetailProps {
  call: HistoricalCallDetail;
  initialSeekMs?: number | null;
  onLinked?: () => void;
  locale?: string;
  mobileCallback?: ReactNode;
}

export function CallRowDetail({ call: inputCall, initialSeekMs = null, onLinked, locale: requestedLocale, mobileCallback }: CallRowDetailProps) {
  const t = useTranslations('crm.llamadas');
  const currentLocale = useLocale();
  const locale = requestedLocale ?? currentLocale;
  const { formatDate } = useFormatDate();
  const [fresh, setFresh] = useState<HistoricalCallDetail | null>(null);
  const call = fresh?.id === inputCall.id ? { ...inputCall, ...fresh } : inputCall;
  const state = useCallIntelligence(call.id, true);
  const [seekToMs, setSeekToMs] = useState<number | null>(initialSeekMs);
  const [currentMs, setCurrentMs] = useState(initialSeekMs ?? 0);
  const [seekVersion, setSeekVersion] = useState(0);
  const onSeek = useCallback((ms: number) => { setSeekToMs(ms); setSeekVersion((value) => value + 1); }, []);
  const onTime = useCallback((ms: number) => setCurrentMs(ms), []);

  // Número al que se llamó (para pre-llenar al crear cliente)
  const phoneNumber = call.direction === 'inbound' ? call.from_number : call.to_number;
  const customerName = call.customer
    ? [call.customer.first_name, call.customer.last_name].filter(Boolean).join(' ') ||
      call.customer.full_name ||
      null
    : null;

  const recording = call.recordings.find((entry) => entry.status === 'ready');
  const recordingPending = call.recordings.some(entry => entry.status === 'processing');
  const recordingAvailable = Boolean(recording) || recordingPending;
  const retention = (recording as (typeof recording & { retention_until?: string | null }))?.retention_until;
  const noAudio = !recordingAvailable;
  const hasHistoricalIntelligence = Boolean(state.transcript || state.analysis?.analysis);
  const note = typeof call.metadata?.disposition_note === 'string' && call.metadata.disposition_note.trim() ? call.metadata.disposition_note : typeof call.metadata?.live_note === 'string' ? call.metadata.live_note : null;
  const opportunityAmount = typeof call.opportunity?.amount === 'number' && call.opportunity.currency
    ? new Intl.NumberFormat(locale, { style: 'currency', currency: call.opportunity.currency }).format(call.opportunity.amount) : null;
  const linked = () => {
    if (onLinked) onLinked();
    else void pedirCrm<HistoricalCallDetail>(`/api/crm/calls/${call.id}`).then(({ data }) => setFresh(data)).catch(() => toast({ title: t('error'), variant: 'destructive' }));
  };
  const linkedContent = <CallLinkPanel callId={call.id} customerId={call.customer_id} opportunityId={call.opportunity_id} phoneNumber={phoneNumber} customerName={customerName} opportunityName={call.opportunity?.name} opportunityStage={call.opportunity?.etapa?.name} opportunityAmount={opportunityAmount} embedded onLinked={linked} />;
  return <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start" data-call-detail-layout>
    <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
      <FormSection titulo={t('columnas.grabacion')} densidad="compacta" formatoMovil="contenido" className="order-1 lg:order-none" accion={retention ? <span className="rounded-full bg-subtle px-2 py-0.5 text-xs text-fg-secondary">{t('ficha.retencion', { fecha: formatDate(retention) })}</span> : undefined}>
        <CallPlayer callId={call.id} recordingEnabled={recordingAvailable} processing={recordingPending && !recording} consentMethod={call.consent_method} initialRecordings={call.recordings} initialConsents={call.consents} variant="full" seekToMs={seekToMs} seekVersion={seekVersion} onTimeUpdate={onTime} />
      </FormSection>
      {noAudio && !hasHistoricalIntelligence ? <FormSection titulo={t('ficha.notasVendedor')} densidad="compacta" className="order-4 lg:order-none"><p className="rounded-lg bg-info-subtle p-3 text-[13px] leading-[18px] text-info-text">{t('ficha.sinAudioIA')}</p><p className="whitespace-pre-wrap text-sm leading-5 text-fg">{note?.trim() || t('ficha.sinNotasVendedor')}</p></FormSection> : <CallTranscriptPanel callId={call.id} state={state} onSeek={onSeek} currentMs={currentMs} variante="ficha" customerName={customerName} agentName={call.user ? [call.user.first_name, call.user.last_name].filter(Boolean).join(' ') : null} className="order-4 lg:order-none" />}
    </div>
    {noAudio && !hasHistoricalIntelligence && !state.error ? <div className="contents lg:block"><FormSection titulo={t('ficha.vinculadaA')} densidad="compacta" className="order-7 lg:order-none">{linkedContent}</FormSection>{mobileCallback && <div className="order-5 flex justify-end lg:hidden">{mobileCallback}</div>}</div> : <CallAnalysisPanel callId={call.id} state={state} opportunityId={call.opportunity_id} variante="ficha" onSeek={onSeek} mobileCallback={mobileCallback} linkedContent={linkedContent} />}
  </div>;
}

export default CallRowDetail;
