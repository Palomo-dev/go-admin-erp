'use client';

import { useTranslations } from 'next-intl';
import { Bot, PenLine, PhoneIncoming, PhoneMissed, PhoneOutgoing, Smartphone, Voicemail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/kit/StatusBadge';
import type { TonoBadge } from '@/components/kit/estadoTono';
import type { CallListRow } from '@/lib/services/crm/callManagementService';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatDuration } from './callsListadoLogica';
import { CallPlayer } from './CallPlayer';

export function datosContactoLlamada(call: CallListRow) {
  const numero = call.direction === 'inbound' ? call.from_number : call.to_number;
  const nombre = call.customer?.full_name || [call.customer?.first_name, call.customer?.last_name].filter(Boolean).join(' ');
  return { numero, nombre: nombre || null };
}

export function ClienteLlamada({ call }: { call: CallListRow }) {
  const { nombre, numero } = datosContactoLlamada(call);
  return <div className="flex min-w-0 flex-col gap-0.5">
    <span className={`truncate text-sm font-medium leading-5 text-fg ${nombre ? '' : 'font-mono'}`}>{nombre ?? numero}</span>
    <span className="truncate text-xs leading-4 text-fg-secondary">{call.opportunity?.name ?? (nombre ? numero : '—')}</span>
  </div>;
}

export function TipoLlamada({ call }: { call: CallListRow }) {
  const t = useTranslations('crm.llamadas');
  const Icono = call.mode === 'ai_agent' ? Bot : call.mode === 'bridge' ? Smartphone : call.mode === 'manual' ? PenLine
    : call.status === 'voicemail' ? Voicemail : call.direction === 'inbound' && call.status === 'no_answer' ? PhoneMissed
      : call.direction === 'inbound' ? PhoneIncoming : PhoneOutgoing;
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] leading-[18px] text-fg-secondary">
    <Icono className="size-4 shrink-0" aria-hidden="true" strokeWidth={1.5} />
    {t(`direcciones.${call.direction}`)} · {t(`modos.${call.mode}`)}
  </span>;
}

export function ResultadoLlamada({ call }: { call: CallListRow }) {
  const t = useTranslations('crm.llamadas');
  const estado = call.disposition_outcome ?? call.status;
  const clave = call.disposition_outcome ? `resultados.${estado}` : `estados.${estado}`;
  const tonos: Record<string, TonoBadge> = {
    answered: 'exito', completed: 'exito', no_answer: 'peligro', wrong_number: 'peligro', failed: 'peligro',
    busy: 'advertencia', voicemail: 'informacion', callback_requested: 'marca',
    dialing: 'neutro', ringing: 'advertencia', in_progress: 'informacion', canceled: 'neutro',
  };
  return <StatusBadge estado={estado} etiqueta={t.has(clave) ? t(clave) : estado} tono={tonos[estado] ?? 'neutro'} tipografia="figma" />;
}

export function SentimientoLlamada({ call }: { call: CallListRow }) {
  const t = useTranslations('crm.llamadas');
  const sentimiento = call.analysis?.sentiment;
  const punto = sentimiento === 'positive' ? 'bg-success' : sentimiento === 'negative' ? 'bg-danger' : sentimiento === 'mixed' ? 'bg-warning' : 'bg-fg-muted';
  return <span className="inline-flex items-center gap-1.5 text-[13px] leading-[18px] text-fg-secondary">
    <span className={`size-2 shrink-0 rounded-full ${punto}`} aria-hidden="true" />
    {sentimiento ? t.has(`sentimientos.${sentimiento}`) ? t(`sentimientos.${sentimiento}`) : sentimiento : '—'}
  </span>;
}

export function GrabacionLlamada({ call }: { call: CallListRow }) {
  const t = useTranslations('crm.llamadas');
  const ready = call.recordings.some((r) => r.status === 'ready');
  return <span onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
    {ready ? <CallPlayer callId={call.id} recordingEnabled consentMethod={call.consent_method} etiqueta={t('oir')} className="h-8 w-auto px-0 text-[13px] text-link" />
      : call.recordings.some((r) => r.status === 'processing') ? <Badge tono="neutro" tamano="sm">{t('procesando')}</Badge>
        : <span className="text-fg-muted">—</span>}
  </span>;
}

export function TarjetaLlamada({ call, onAbrir }: { call: CallListRow; onAbrir: () => void }) {
  const t = useTranslations('crm.llamadas');
  const { formatDateTime } = useFormatDate(null);
  const { nombre, numero } = datosContactoLlamada(call);
  return <article className="rounded-xl border border-line bg-surface p-3">
    <button type="button" onClick={onAbrir} aria-label={t('fila', { nombre: nombre ?? numero })}
      data-phone={numero} data-customer-id={call.customer?.id ?? undefined} data-opportunity-id={call.opportunity_id ?? undefined} data-display-name={nombre ?? undefined}
      className="flex w-full min-w-0 flex-col gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
      <span className="flex w-full min-w-0 items-start justify-between gap-2"><ClienteLlamada call={call} /><ResultadoLlamada call={call} /></span>
      <span className="text-xs text-fg-secondary">{formatDateTime(call.started_at ?? call.created_at)} · {formatDuration(call.duration_seconds)}</span>
      <TipoLlamada call={call} />
    </button>
    <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2"><SentimientoLlamada call={call} /><GrabacionLlamada call={call} /></div>
  </article>;
}
