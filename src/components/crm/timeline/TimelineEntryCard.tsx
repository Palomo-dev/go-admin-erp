'use client';

import type { ComponentType } from 'react';
import { Phone, Mail, MessageCircle, Bot, CheckSquare, StickyNote, Calendar, RefreshCw, Activity, MessageSquare, PhoneCall } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/utils/Utils';
import type { TimelineEntry, TimelineKind } from '@/lib/services/crm/timelineService';
import { formatDateTime, relativeTime } from './utils';
import { CallEntry } from './entries/CallEntry';
import { EmailEntry } from './entries/EmailEntry';
import { WhatsAppEntry } from './entries/WhatsAppEntry';
import { AiCallEntry } from './entries/AiCallEntry';
import { TaskEntry } from './entries/TaskEntry';
import { NoteEntry } from './entries/NoteEntry';
import { MeetingEntry } from './entries/MeetingEntry';
import { SystemEntry } from './entries/SystemEntry';
import { GenericEntry } from './entries/GenericEntry';

/**
 * TimelineEntryCard — cabecera común (icono por kind, usuario, hora relativa +
 * absoluta) y cuerpo delegado por kind a entries/* (FASE-09 §5.2).
 */
export type EntryAction = 'reply_email' | 'reply_whatsapp' | 'open_call' | 'apply_analysis' | 'changed';

export interface EntryActionContext {
  opportunityId?: string;
  customerId?: string;
  customer?: { id?: string; full_name?: string | null; email?: string | null; phone?: string | null } | null;
}

export interface TimelineEntryCardProps {
  entry: TimelineEntry;
  compact?: boolean;
  context?: EntryActionContext;
  onAction?: (action: EntryAction, entry: TimelineEntry) => void;
  isNew?: boolean;
}

const KIND_STYLE: Record<TimelineKind, { icon: ComponentType<{ className?: string }>; bg: string; fg: string; label: string }> = {
  call: { icon: Phone, bg: 'bg-green-100 dark:bg-green-900/30', fg: 'text-green-600 dark:text-green-400', label: 'Llamada' },
  call_live: { icon: PhoneCall, bg: 'bg-green-100 dark:bg-green-900/30', fg: 'text-green-600 dark:text-green-400', label: 'Llamada en curso' },
  email: { icon: Mail, bg: 'bg-blue-100 dark:bg-blue-900/30', fg: 'text-blue-600 dark:text-blue-400', label: 'Email' },
  whatsapp: { icon: MessageCircle, bg: 'bg-emerald-100 dark:bg-emerald-900/30', fg: 'text-emerald-600 dark:text-emerald-400', label: 'WhatsApp' },
  sms: { icon: MessageSquare, bg: 'bg-cyan-100 dark:bg-cyan-900/30', fg: 'text-cyan-600 dark:text-cyan-400', label: 'SMS' },
  ai_call: { icon: Bot, bg: 'bg-violet-100 dark:bg-violet-900/30', fg: 'text-violet-600 dark:text-violet-400', label: 'Llamada IA' },
  task: { icon: CheckSquare, bg: 'bg-indigo-100 dark:bg-indigo-900/30', fg: 'text-indigo-600 dark:text-indigo-400', label: 'Tarea' },
  note: { icon: StickyNote, bg: 'bg-amber-100 dark:bg-amber-900/30', fg: 'text-amber-600 dark:text-amber-400', label: 'Nota' },
  meeting: { icon: Calendar, bg: 'bg-purple-100 dark:bg-purple-900/30', fg: 'text-purple-600 dark:text-purple-400', label: 'Reunión' },
  system: { icon: RefreshCw, bg: 'bg-gray-100 dark:bg-gray-800', fg: 'text-gray-500 dark:text-gray-400', label: 'Sistema' },
  activity: { icon: Activity, bg: 'bg-gray-100 dark:bg-gray-800', fg: 'text-gray-600 dark:text-gray-300', label: 'Actividad' },
};

export function kindStyle(kind: TimelineKind) {
  return KIND_STYLE[kind] ?? KIND_STYLE.activity;
}

function Body({ entry, compact, context, onAction }: TimelineEntryCardProps) {
  switch (entry.kind) {
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

export function TimelineEntryCard(props: TimelineEntryCardProps) {
  const { entry, isNew } = props;
  const style = kindStyle(entry.kind);
  const Icon = style.icon;
  const titleId = `tl-${entry.kind}-${entry.id}`;
  const isSystem = entry.kind === 'system';

  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        'relative pl-10 transition-colors',
        isNew && 'animate-in fade-in slide-in-from-top-1 duration-200'
      )}
    >
      <span className={cn('absolute left-0 top-0.5 flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-white dark:ring-gray-900', style.bg, style.fg)} aria-hidden>
        <Icon className={cn('h-3.5 w-3.5', entry.kind === 'call_live' && 'animate-pulse')} />
      </span>
      <div className={cn(isSystem ? 'py-1' : 'rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 p-3')}>
        <header className="flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span id={titleId} className="sr-only">{style.label}</span>
            {entry.user && (
              <span className="inline-flex items-center gap-1.5 min-w-0">
                {entry.user.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={entry.user.avatar_url} alt="" className="h-4 w-4 rounded-full object-cover" />
                ) : (
                  <span className="h-4 w-4 rounded-full bg-gray-200 dark:bg-gray-700 text-[9px] font-semibold flex items-center justify-center text-gray-600 dark:text-gray-300">
                    {entry.user.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="truncate font-medium text-gray-700 dark:text-gray-300">{entry.user.name}</span>
              </span>
            )}
          </div>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <time dateTime={entry.occurred_at} className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0 cursor-default">
                  {relativeTime(entry.occurred_at)}
                </time>
              </TooltipTrigger>
              <TooltipContent side="left"><p className="text-xs">{formatDateTime(entry.occurred_at)}</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </header>
        <Body {...props} />
      </div>
    </article>
  );
}

export default TimelineEntryCard;
