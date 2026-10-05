'use client';

import { useTranslations } from 'next-intl';
import { TimelineEntry as EntradaKit } from '@/components/crm/kit/TimelineEntry';
import type { TipoEntrada } from '@/components/crm/kit/timelineEntryLogica';
import type { TimelineEntry, TimelineKind } from '@/lib/services/crm/timelineService';
import { CallEntry } from './entries/CallEntry';
import { EmailEntry } from './entries/EmailEntry';
import { WhatsAppEntry } from './entries/WhatsAppEntry';
import { AiCallEntry } from './entries/AiCallEntry';
import { TaskEntry } from './entries/TaskEntry';
import { NoteEntry } from './entries/NoteEntry';
import { MeetingEntry } from './entries/MeetingEntry';
import { SystemEntry } from './entries/SystemEntry';
import { GenericEntry } from './entries/GenericEntry';
import { FinancialEntry } from './entries/FinancialEntry';

/**
 * TimelineEntryCard — cabecera común (icono por kind, usuario, hora relativa +
 * absoluta) y cuerpo delegado por kind a entries/* (FASE-09 §5.2).
 */
export type EntryAction = 'reply_email' | 'reply_whatsapp' | 'open_call' | 'apply_analysis' | 'changed';

export interface EntryActionContext {
  opportunityId?: string;
  customerId?: string;
  customer?: { id?: string; full_name?: string | null; email?: string | null; phone?: string | null; do_not_call?: boolean | null } | null;
}

export interface TimelineEntryCardProps {
  entry: TimelineEntry;
  compact?: boolean;
  context?: EntryActionContext;
  onAction?: (action: EntryAction, entry: TimelineEntry) => void;
  isNew?: boolean;
}

function Body({ entry, compact, context, onAction }: TimelineEntryCardProps) {
  switch (entry.kind) {
    case 'sale':
    case 'reservation':
    case 'web_order':
      return <FinancialEntry entry={entry} />;
    case 'call':
    case 'call_live':
      return <CallEntry entry={entry} compact={compact} opportunityId={context?.opportunityId} onAction={onAction} />;
    case 'email':
      return <EmailEntry entry={entry} compact={compact} onAction={onAction} />;
    case 'whatsapp':
      return <WhatsAppEntry entry={entry} compact={compact} context={context} onAction={onAction} />;
    case 'ai_call':
      return <AiCallEntry entry={entry} compact={compact} />;
    case 'task':
      return <TaskEntry entry={entry} onAction={onAction} />;
    case 'note':
      return <NoteEntry entry={entry} compact={compact} />;
    case 'meeting':
      return <MeetingEntry entry={entry} onAction={onAction} />;
    case 'system':
      return <SystemEntry entry={entry} />;
    default:
      return <GenericEntry entry={entry} />;
  }
}

const TIPO: Record<TimelineKind, TipoEntrada> = {
  call: 'llamada', call_live: 'llamada', sms: 'llamada', email: 'email', whatsapp: 'whatsapp',
  ai_call: 'llamadaIa', task: 'tarea', note: 'nota', meeting: 'reunion', system: 'sistema',
  activity: 'sistema', sale: 'venta', reservation: 'reserva', web_order: 'pedido',
};

export function TimelineEntryCard(props: TimelineEntryCardProps) {
  const { entry, isNew } = props;
  const t = useTranslations('crm.kit.linea');
  const tipo = TIPO[entry.kind];
  return <EntradaKit entrada={{ id: entry.id, tipo, titulo: t(`tipo.${tipo}`),
    ocurrioEn: entry.occurred_at, autor: entry.user?.name }}
    className={isNew ? 'animate-in fade-in slide-in-from-top-1 duration-200' : undefined}>
    <div className="min-w-0 break-words"><Body {...props} /></div>
  </EntradaKit>;
}

export default TimelineEntryCard;
