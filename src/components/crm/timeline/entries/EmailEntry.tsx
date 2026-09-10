'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ChevronDown, ChevronRight, Eye, MousePointerClick, Send, AlertTriangle, Reply, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HtmlContentRenderer } from '@/components/shared/HtmlContentRenderer';
import type { TimelineEntry } from '@/lib/services/crm/timelineService';
import { formatTime } from '../utils';
import type { EntryAction } from '../TimelineEntryCard';

const ComposeEmailDialog = dynamic(() => import('@/components/crm/shared/ComposeEmailDialog').then((m) => m.ComposeEmailDialog), { ssr: false });

/**
 * EmailEntry — asunto, destinatario, estado con eventos (abierto/clic/rebote),
 * cuerpo colapsable (GET /api/email/messages/[id]?events=true si no vino el
 * snapshot) y "Responder" (ComposeEmailDialog v1).
 */
type EmailLike = Extract<TimelineEntry, { kind: 'email' }>;

const STATUS: Record<string, { label: string; variant: 'success' | 'info' | 'warning' | 'destructive' | 'secondary' }> = {
  pending: { label: 'Pendiente', variant: 'secondary' },
  sent: { label: 'Enviado', variant: 'info' },
  delivered: { label: 'Entregado', variant: 'info' },
  opened: { label: 'Abierto', variant: 'success' },
  clicked: { label: 'Clic', variant: 'success' },
  bounced: { label: 'Rebotado', variant: 'destructive' },
  complained: { label: 'Spam', variant: 'destructive' },
  unsubscribed: { label: 'Baja', variant: 'warning' },
  failed: { label: 'Fallido', variant: 'destructive' },
};

const EVENT_ICON: Record<string, typeof Send> = { sent: Send, delivered: Send, opened: Eye, clicked: MousePointerClick, bounced: AlertTriangle, complained: AlertTriangle };
const EVENT_LABEL: Record<string, string> = { sent: 'enviado', delivered: 'entregado', opened: 'abierto', clicked: 'clic', bounced: 'rebote', complained: 'queja', unsubscribed: 'baja', failed: 'fallo' };

export function EmailEntry({ entry, compact, onAction }: { entry: EmailLike; compact?: boolean; onAction?: (a: EntryAction, e: TimelineEntry) => void }) {
  const { email, events } = entry;
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState<string | null>(email.body_html_snapshot);
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState(false);
  const st = STATUS[email.status] ?? { label: email.status, variant: 'secondary' as const };

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && body == null && !loading) {
      setLoading(true);
      try {
        const r = await fetch(`/api/email/messages/${email.id}?events=true`, { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.success) setBody(j.data?.body_html_snapshot ?? j.data?.body_html ?? '');
        else setBody('');
      } catch {
        setBody('');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{email.subject || '(sin asunto)'}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">a {email.to_email}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant={st.variant} className="text-[11px]">{st.label}{email.open_count > 1 ? ` ${email.open_count}×` : ''}</Badge>
          {email.click_count > 0 && <Badge variant="success" className="text-[11px]">clic {email.click_count}×</Badge>}
        </div>
      </div>
      {email.status === 'bounced' && (
        <p className="text-xs text-red-600 dark:text-red-400">Este correo rebotó: revisa la dirección antes de volver a enviar.</p>
      )}
      {events.length > 0 && !compact && (
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500 dark:text-gray-400">
          {events.slice(0, 6).map((ev, i) => {
            const Icon = EVENT_ICON[ev.event_type] ?? Send;
            return <li key={i} className="inline-flex items-center gap-1"><Icon className="h-3 w-3" />{EVENT_LABEL[ev.event_type] ?? ev.event_type} {formatTime(ev.occurred_at)}</li>;
          })}
        </ul>
      )}
      <div className="flex items-center gap-2 pt-0.5">
        <button type="button" onClick={toggle} aria-expanded={open} className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}Ver correo
        </button>
        <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { setReply(true); onAction?.('reply_email', entry); }}>
          <Reply className="h-3 w-3 mr-1" />Responder
        </Button>
      </div>
      {open && (
        <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-2 max-h-80 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-gray-500 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Cargando…</p>
          ) : body ? (
            <HtmlContentRenderer html={body} className="text-sm text-gray-700 dark:text-gray-300" />
          ) : (
            <p className="text-xs text-gray-500">Sin contenido guardado.</p>
          )}
        </div>
      )}
      {reply && (
        <ComposeEmailDialog open onOpenChange={(o) => !o && setReply(false)} customer={{ email: email.to_email }} replyTo={{ email_message_id: email.id, subject: email.subject }} onSent={() => setReply(false)} />
      )}
    </div>
  );
}
