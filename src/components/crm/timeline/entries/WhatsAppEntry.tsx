'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Loader2, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import type { TimelineEntry } from '@/lib/services/crm/timelineService';
import { formatTime } from '../utils';
import type { EntryAction, EntryActionContext } from '../TimelineEntryCard';

/**
 * WhatsAppEntry — grupo de mensajes por conversación/día: últimas 5 burbujas,
 * indicador ventana 24 h y "responder aquí" (POST /api/integrations/whatsapp/send
 * con conversation_id). Fuera de ventana el envío exige plantilla (F16): se
 * deshabilita el envío inline y se enlaza a la bandeja.
 */
type WaLike = Extract<TimelineEntry, { kind: 'whatsapp' }>;

export function WhatsAppEntry({ entry, compact, context, onAction }: { entry: WaLike; compact?: boolean; context?: EntryActionContext; onAction?: (a: EntryAction, e: TimelineEntry) => void }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Array<{ id: string; content: string; created_at: string }>>([]);
  const canReply = entry.window_open && Boolean(entry.channel_id);

  const send = async () => {
    if (!text.trim() || !entry.channel_id) return;
    setSending(true);
    try {
      const res = await fetch('/api/integrations/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_id: entry.channel_id,
          to: context?.customer?.phone ?? 'conversation',
          type: 'text',
          text: { body: text.trim() },
          conversation_id: entry.conversation_id,
          customer_id: entry.customer_id ?? context?.customerId,
          opportunity_id: context?.opportunityId,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.success === false) throw new Error(j.error || `Error ${res.status}`);
      setSent((p) => [...p, { id: j.message_id ?? String(Date.now()), content: text.trim(), created_at: new Date().toISOString() }]);
      setText('');
      onAction?.('reply_whatsapp', entry);
    } catch (e) {
      toast({ title: 'No se pudo enviar', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const bubbles = [...entry.messages, ...sent.map((s) => ({ ...s, direction: 'outbound', role: 'agent', content_type: 'text' }))];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span className="font-medium text-gray-900 dark:text-gray-100">WhatsApp · {entry.count}{entry.truncated ? '+' : ''} mensaje{entry.count === 1 && !entry.truncated ? '' : 's'}</span>
        <Badge variant={entry.window_open ? 'success' : 'warning'} className="text-[11px]">{entry.window_open ? 'ventana 24 h abierta' : 'fuera de ventana'}</Badge>
        <Link href={`/app/chat/conversaciones/${entry.conversation_id}`} className="ml-auto inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline">
          Abrir bandeja <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <ul className="space-y-1">
        {bubbles.slice(compact ? -3 : -8).map((m) => {
          const out = m.direction === 'outbound';
          return (
            <li key={m.id} className={cn('flex', out ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[85%] rounded-2xl px-3 py-1.5 text-xs', out ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100 rounded-br-sm' : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-sm')}>
                <p className="whitespace-pre-wrap break-words">{m.content_type !== 'text' && !m.content ? `[${m.content_type}]` : m.content}</p>
                <p className={cn('text-[10px] mt-0.5 opacity-70', out ? 'text-right' : '')}>{m.role === 'ai' ? 'IA · ' : ''}{formatTime(m.created_at)}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-2 items-end">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder={canReply ? 'Responder aquí…' : 'Fuera de la ventana de 24 h: usa una plantilla desde la bandeja'} disabled={!canReply || sending} className="min-h-[36px] text-xs resize-none" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
        <Button type="button" size="sm" className="h-9 px-3" onClick={send} disabled={!canReply || sending || !text.trim()} aria-label="Enviar">
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}
