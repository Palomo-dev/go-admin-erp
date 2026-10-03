'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Phone, PhoneOff, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { Isotipo } from '@/components/shell/marca/Firma';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useSession } from '@/lib/context/SessionContext';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { fetchJson } from '@/lib/utils/fetchJson';
import { getMobilePlugin, isMobile, safeAddListener } from '@/lib/utils/mobile';
import { incomingCallPushId, incomingContext, type MobileIncomingContext } from './incomingCallPush';

/** Audio PSTN del SO; el push no crea un Device ni acredita que se contestó. */
export function IncomingMobileCall({ organizationId }: { organizationId: number | null }) {
  const t = useTranslations('phoneMobile'); const { timezone } = useOrgTimezone();
  const { session } = useSession(); const search = useSearchParams();
  const [callId, setCallId] = useState<string | null>(null); const [context, setContext] = useState<MobileIncomingContext | null>(null);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [waiting, setWaiting] = useState(false);
  const [readAttempt, setReadAttempt] = useState(0);
  const pending = useRef(false);
  const scope = `${organizationId}:${session?.user?.id ?? ''}`; const currentScope = useRef(scope); currentScope.current = scope;
  const currentCall = useRef(callId); currentCall.current = callId;
  useEffect(() => {
    pending.current = false; setBusy(false); setCallId(null); setContext(null); setError(null); setWaiting(false);
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
    const id = callId, capturedScope = scope;
    pending.current = true; setBusy(true); setError(null);
    try {
      await fetchJson(`/api/voice/inbound/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (currentScope.current === capturedScope && currentCall.current === id) setCallId(null);
    } catch { if (currentScope.current === capturedScope && currentCall.current === id) setError('rejectFailed'); }
    finally { if (currentScope.current === capturedScope) { pending.current = false; setBusy(false); } }
  };
  if (!callId) return null;
  const name = context?.customer_name ?? context?.from_number ?? t('incoming');
  return <Dialog open onOpenChange={open => { if (!open && !pending.current) setCallId(null); }}><DialogContent hideCloseButton aria-describedby={undefined} className="inset-0 left-0 top-0 z-[80] flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col justify-center gap-0 rounded-none border-0 bg-brand-deep p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-white sm:rounded-none">
    <Button variant="ghost" size="icon" disabled={busy} className="absolute right-3 top-3 size-10 text-white hover:bg-white/10 hover:text-white" aria-label={t('close')} onClick={() => setCallId(null)}><X size={20} strokeWidth={1.5} /></Button>
    <div className="rounded-2xl bg-surface p-3.5 text-fg">
      <p className="flex items-center gap-2 text-xs font-medium leading-4 text-fg-secondary"><Isotipo tamano={24} />GO Admin</p>
      <p className="mt-3 text-sm font-medium leading-5">{context ? `${name} · ${t('line', { number: context.to_number })}` : t('contextTitle')}</p>
      <p className="mt-1.5 flex items-start gap-2 text-xs font-medium leading-4 text-fg-secondary">{context ? <><Smartphone size={16} className="shrink-0" strokeWidth={1.5} />{t('pstnHint')}</> : t('loading')}</p>
    </div>
    <div className="mt-10 flex flex-col items-center gap-2 text-center">
      <AvatarIniciales nombre={name} tamano="md" className="mb-1 size-12 bg-brand text-base font-medium text-white" />
      <DialogTitle className="break-words text-[28px] font-semibold leading-9 tracking-[-.4px] text-white">{name}</DialogTitle>
      {context?.customer_name && <p className="text-[13px] font-medium leading-[18px] text-white/65">{context.from_number}{context.customer_name && context.since ? ` · ${t('customerSince', { date: formatDateInTz(context.since, timezone, { year: 'numeric' }) })}` : ''}</p>}
      {(waiting || error) && <p role={error ? 'alert' : 'status'} className="mt-2 rounded-xl bg-white/10 p-3 text-sm">{error ? t(error) : t('answerHint')}</p>}
      {error && !context && <Button variant="outline" className="text-fg" onClick={() => setReadAttempt(previous => previous + 1)}>{t('retry')}</Button>}
    </div>
    <div className="mt-10 flex justify-center gap-12">
      <div className="flex flex-col items-center gap-1.5"><Button variant="destructive" disabled={!context || busy} className="size-14 rounded-full bg-danger" aria-label={t('reject')} onClick={() => { void reject(); }}><PhoneOff size={24} strokeWidth={1.5} /></Button><span className="text-xs font-medium leading-4">{t('reject')}</span></div>
      <div className="flex flex-col items-center gap-1.5"><Button disabled={!context || busy} className="size-14 rounded-full bg-success hover:bg-success-text" aria-label={t('answer')} onClick={() => setWaiting(true)}><Phone size={24} strokeWidth={1.5} /></Button><span className="text-xs font-medium leading-4">{t('answer')}</span></div>
    </div>
  </DialogContent></Dialog>;
}
