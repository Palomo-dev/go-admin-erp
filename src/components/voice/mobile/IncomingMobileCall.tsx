'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Phone, PhoneOff, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useSession } from '@/lib/context/SessionContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { fetchJson } from '@/lib/utils/fetchJson';
import { getMobilePlugin, isMobile, safeAddListener } from '@/lib/utils/mobile';
import { incomingCallPushId, incomingContext, type MobileIncomingContext } from './incomingCallPush';

/** Audio PSTN del SO; el push no crea un Device ni acredita que se contestó. */
export function IncomingMobileCall({ organizationId }: { organizationId: number | null }) {
  const t = useTranslations('phoneMobile'); const { formatDate } = useFormatDate();
  const { session } = useSession(); const search = useSearchParams();
  const [callId, setCallId] = useState<string | null>(null); const [context, setContext] = useState<MobileIncomingContext | null>(null);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [waiting, setWaiting] = useState(false);
  const [readAttempt, setReadAttempt] = useState(0);
  const pending = useRef(false);
  useEffect(() => {
    setCallId(null); setContext(null); setError(null); setWaiting(false);
    if (!isMobile() || !organizationId || !session?.user?.id) return;
    const push = getMobilePlugin('PushNotifications'); if (!push) return;
    let alive = true; const cleanups: (() => Promise<void>)[] = [];
    const receive = (raw: unknown) => { const id = incomingCallPushId(raw, organizationId); if (alive && id) setCallId(id); };
    for (const event of ['pushNotificationReceived', 'pushNotificationActionPerformed']) {
      void safeAddListener(push, event, receive).then(handle => { if (!handle) return; if (alive) cleanups.push(() => handle.remove()); else void handle.remove(); });
    }
    return () => { alive = false; for (const cleanup of cleanups) void cleanup().catch(() => undefined); };
  }, [organizationId, session?.user?.id]);
  // Al tocar Web Push/una notificación cerrada, el id sigue siendo una pista: la RPC vuelve a autorizar.
  const queryId = search?.get('incoming');
  useEffect(() => {
    if (!isMobile() || !organizationId || !queryId || !session?.user?.id) return;
    const id = incomingCallPushId({ data: { type: 'crm_inbound_call', call_id: queryId, organization_id: String(organizationId) } }, organizationId);
    if (id) setCallId(id);
  }, [queryId, organizationId, session?.user?.id]);
  useEffect(() => {
    setContext(null); setError(null); setWaiting(false);
    if (!callId) return;
    const controller = new AbortController(); let stopped = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      try {
        const result = await fetchJson<{ data: unknown }>(`/api/voice/inbound/${callId}/context`, { signal: controller.signal, timeoutMs: 10000 });
        if (stopped) return;
        const next = incomingContext(result.data, callId);
        if (next.invitation_mode !== 'mobile' || !['dialing', 'ringing'].includes(next.status)
          || !['reserved', 'dispatched', 'ringing'].includes(next.mobile_invite_state ?? '')) { setCallId(null); return; }
        setContext(next); setError(null);
        timer = setTimeout(read, 2500);
      } catch {
        if (stopped) return; setContext(null); setError('unavailable');
      }
    };
    void read();
    return () => { stopped = true; controller.abort(); if (timer) clearTimeout(timer); };
  }, [callId, readAttempt, organizationId, session?.user?.id]);
  const reject = async () => {
    if (!callId || pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try { await fetchJson(`/api/voice/inbound/${callId}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); setCallId(null); }
    catch { setError('rejectFailed'); }
    finally { pending.current = false; setBusy(false); }
  };
  if (!callId) return null;
  const name = context?.customer_name ?? context?.from_number ?? t('incoming');
  return <section role="dialog" aria-modal="true" aria-labelledby="incoming-mobile-title"
    className="fixed inset-0 z-[80] flex min-h-dvh flex-col bg-blue-800 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-white">
    <div className="flex items-center justify-between text-sm"><span className="font-semibold">GO Admin · {t('incoming')}</span>
      <Button variant="ghost" size="icon" disabled={busy} className="text-white hover:bg-white/10 hover:text-white" aria-label={t('close')} onClick={() => setCallId(null)}><X size={20} /></Button></div>
    <div className="mt-6 rounded-2xl bg-white p-4 text-sm text-slate-900">
      <p className="font-semibold">{t('contextTitle')}</p><p className="mt-1 text-xs text-slate-500">{context ? t('line', { number: context.to_number }) : t('loading')}</p>
      {context && <p className="mt-3 flex gap-2 text-xs text-blue-700"><Smartphone size={16} className="shrink-0" />{t('pstnHint')}</p>}
    </div>
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <Avatar className="h-24 w-24"><AvatarFallback className="bg-white/20 text-3xl text-white">{context?.customer_name ? name.slice(0, 2).toUpperCase() : <Phone size={32} strokeWidth={1.5} />}</AvatarFallback></Avatar>
      <h2 id="incoming-mobile-title" className="break-all text-2xl font-semibold">{name}</h2>
      {context?.customer_name && <p className="font-mono text-lg">{context.from_number}</p>}
      {context?.customer_name && context.since && <p className="text-sm text-blue-100">{t('customerSince', { date: formatDate(context.since) })}</p>}
      {(waiting || error) && <p role={error ? 'alert' : 'status'} className="rounded-xl bg-white/10 p-3 text-sm">{error ? t(error) : t('answerHint')}</p>}
      {error && !context && <Button variant="outline" className="text-slate-900" onClick={() => setReadAttempt(previous => previous + 1)}>{t('retry')}</Button>}
    </div>
    <div className="flex justify-around gap-8">
      <div className="flex flex-col items-center gap-3"><Button variant="destructive" disabled={!context || busy} className="h-16 w-16 rounded-full" aria-label={t('reject')} onClick={() => { void reject(); }}><PhoneOff size={28} strokeWidth={1.5} /></Button><span className="text-sm">{t('reject')}</span></div>
      <div className="flex flex-col items-center gap-3"><Button disabled={!context || busy} className="h-16 w-16 rounded-full bg-green-600 hover:bg-green-700" aria-label={t('answer')}
        onClick={() => { setWaiting(true); }}><Phone size={28} strokeWidth={1.5} /></Button><span className="text-sm">{t('answer')}</span></div>
    </div>
  </section>;
}
