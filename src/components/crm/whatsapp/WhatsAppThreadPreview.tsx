'use client';

/**
 * WhatsAppThreadPreview (FASE-16 §5.2): últimos N mensajes de una conversación
 * con estado (último `message_events`), realtime sobre messages/message_events
 * y respuesta inline (POST /api/crm/whatsapp/reply) si la ventana está abierta.
 *
 * Complementa a `WhatsAppEntry` (F9, timeline): úsalo en el drawer/detalle de
 * oportunidad pasando `conversationId`. F9 puede sustituir el cuerpo de
 * WhatsAppEntry por este componente sin cambiar su firma.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Loader2, RefreshCw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { computeWindow } from '@/lib/services/crm/whatsapp/windowService';
import { BubblePreview } from './compose/BubblePreview';
import { WindowBadge } from './compose/WindowBadge';
import { waApi, ERROR_CODE_LABELS, type WindowInfo } from './api';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { formatTimeInTz } from '@/lib/utils/dateDisplay';

interface Msg { id: string; direction: string; role: string; content: string; content_type: string; created_at: string; payload: Record<string, unknown> | null; metadata: Record<string, unknown> | null }
interface Ev { message_id: string; event_type: string; error_code: string | null; error_message: string | null; created_at: string }
const RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 9 };

export function WhatsAppThreadPreview({ conversationId, opportunityId, limit = 5, className }: { conversationId: string; opportunityId?: string | null; limit?: number; className?: string }) {
  const { timezone } = useOrgTimezone();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [events, setEvents] = useState<Record<string, Ev>>({});
  const [conv, setConv] = useState<{ last_inbound_at: string | null; customer_id: string; channel_id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const [{ data: c }, { data: m }] = await Promise.all([
      supabase.from('conversations').select('last_inbound_at, customer_id, channel_id').eq('id', conversationId).maybeSingle(),
      supabase.from('messages').select('id, direction, role, content, content_type, created_at, payload, metadata').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(limit),
    ]);
    setConv((c as typeof conv) ?? null);
    const list = ((m ?? []) as Msg[]).reverse();
    setMessages(list);
    if (list.length) {
      const { data: ev } = await supabase.from('message_events').select('message_id, event_type, error_code, error_message, created_at').in('message_id', list.map((x) => x.id)).order('created_at', { ascending: true });
      const map: Record<string, Ev> = {};
      for (const e of (ev ?? []) as Ev[]) if ((RANK[e.event_type] ?? 0) >= (RANK[map[e.message_id]?.event_type] ?? 0)) map[e.message_id] = e;
      setEvents(map);
    }
    setLoading(false);
  }, [conversationId, limit]);

  useEffect(() => {
    void load();
    const ch = supabase.channel(`wa-thread-${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, () => void load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_events' }, (p) => {
        const e = p.new as Ev;
        setEvents((cur) => (messages.some((m) => m.id === e.message_id) || cur[e.message_id]) && (RANK[e.event_type] ?? 0) >= (RANK[cur[e.message_id]?.event_type] ?? 0) ? { ...cur, [e.message_id]: e } : cur);
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, load]);

  const win = computeWindow(conv?.last_inbound_at ?? null);
  const windowInfo: WindowInfo | null = conv ? { ...win, conversation_id: conversationId, label: '', channel: { id: conv.channel_id, name: '', status: 'active', provider: 'meta', capabilities: { templates: true, media: true, free_text: true } }, recipient: null, can_contact: true, can_contact_marketing: true } : null;

  const reply = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await waApi.reply({ conversationId, text: text.trim(), opportunityId });
      setText('');
      await load();
    } catch (e) {
      toast({ title: 'No se pudo enviar', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    } finally { setSending(false); }
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-2 text-xs mb-2">
        <span className="font-medium text-gray-900 dark:text-gray-100">WhatsApp</span>
        <WindowBadge window={windowInfo} />
        <button type="button" onClick={() => void load()} aria-label="Actualizar" className="text-gray-400 hover:text-gray-600"><RefreshCw className="h-3 w-3" /></button>
        <Link href={`/app/chat/conversaciones/${conversationId}`} className="ml-auto inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline">Abrir bandeja <ExternalLink className="h-3 w-3" aria-hidden="true" /></Link>
      </div>
      <div className="rounded-lg bg-[#efeae2] dark:bg-[#0b141a] p-2 space-y-1.5 max-h-72 overflow-y-auto">
        {loading ? <p className="text-xs text-gray-500 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Cargando…</p> : messages.length === 0 ? <p className="text-xs text-gray-500 p-2">Sin mensajes todavía.</p> : messages.map((m) => {
          const out = m.direction === 'outbound';
          const ev = events[m.id];
          const status = out ? ((ev?.event_type as 'sent' | 'delivered' | 'read' | 'failed' | undefined) ?? 'pending') : null;
          const media = (m.payload?.media as { mime: string; filename?: string } | undefined) ?? null;
          return (
            <div key={m.id} className={`${out ? 'flex justify-end' : 'flex justify-start'} animate-in fade-in-0 slide-in-from-bottom-1 duration-150 motion-reduce:animate-none`}>
              <div className="max-w-[85%]">
                <BubblePreview body={m.content} media={media} outbound={out} status={status} time={formatTimeInTz(m.created_at, timezone)} />
                {ev?.event_type === 'failed' && <p className="text-[10px] text-red-600 dark:text-red-400 text-right mt-0.5">{ERROR_CODE_LABELS[ev.error_code ?? ''] ?? ev.error_message ?? 'Fallo de envío'}</p>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 items-end mt-2">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} disabled={!win.is_open || sending} placeholder={win.is_open ? 'Responder aquí…' : 'Fuera de la ventana de 24 h: usa una plantilla'} className="min-h-[36px] text-xs resize-none bg-white dark:bg-gray-900" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void reply(); } }} aria-label="Responder por WhatsApp" />
        <Button type="button" size="sm" className="h-9 px-3" onClick={() => void reply()} disabled={!win.is_open || sending || !text.trim()} aria-label="Enviar">{sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}</Button>
      </div>
    </div>
  );
}

export default WhatsAppThreadPreview;
