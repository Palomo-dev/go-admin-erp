'use client';

import { useEffect, useRef } from 'react';
import { Briefcase, PhoneIncoming, Phone, PhoneOff, StickyNote, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSoftphone } from './SoftphoneProvider';
import { PhoneContact } from './dock/PhoneContact';
import { usePhoneContext } from './dock/usePhoneContext';
import { cn } from '@/utils/Utils';

/** Aviso único de llamada: Enter/Esc y botones comparten la misma intención nativa. */
export function IncomingCallToast() {
  const sp = useSoftphone();
  const t = useTranslations('phoneBrowser');
  const acceptRef = useRef<HTMLButtonElement | null>(null);
  const action = useRef<string | null>(null);
  const incoming = sp.available ? sp.incoming : null;
  const active = sp.available ? sp.activeCall : null;
  const context = usePhoneContext(incoming?.from ?? '', active, Boolean(incoming));
  useEffect(() => { action.current = null; if (incoming) acceptRef.current?.focus(); }, [incoming]);
  if (!sp.available || !incoming) return null;
  const run = (type: 'accept' | 'reject') => {
    const key = incoming.callSid ?? incoming.from;
    if (action.current === key) return;
    action.current = key;
    if (type === 'accept') sp.acceptIncoming(); else sp.rejectIncoming();
  };
  const contact = context.contact ?? { id: active?.customerId ?? null, name: active?.displayName ?? null, number: incoming.from };
  return <div className="fixed right-4 top-4 z-[60] w-[360px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-line-warning border-t-4 border-t-warning bg-surface text-fg shadow-[0px_2px_6px_0px_rgba(15,23,42,0.06),0px_12px_32px_-4px_rgba(15,23,42,0.14)]"
    role="alertdialog" aria-modal="false" aria-labelledby="incoming-call-title" aria-describedby="incoming-call-desc"
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); run('reject'); }
      if (event.key === 'Enter' && !(event.target instanceof HTMLElement && event.target.closest('button,a'))) { event.preventDefault(); run('accept'); }
    }}>
    <div className="flex items-center justify-center gap-1.5 px-4 pb-1 pt-4"><PhoneIncoming size={13} strokeWidth={1.5} className="text-warning-text" /><p id="incoming-call-title" className="text-xs font-medium leading-4 text-warning-text">{context.line ? t('incomingLine', { number: context.line.e164 }) : t('incomingTitle')}</p></div>
    <div className="space-y-5 p-5">
      <PhoneContact contact={contact} centered pulse />
      <div id="incoming-call-desc" className={cn('space-y-2', contact.id && 'rounded-xl border border-line bg-canvas p-3')}>
        {contact.opportunity?.name && <p className="flex items-start gap-2 text-xs font-medium leading-4 text-fg-secondary"><Briefcase size={14} strokeWidth={1.5} className="shrink-0" />{contact.opportunity.name}</p>}
        {contact.note ? <p className="flex items-center gap-2 text-xs font-medium leading-4 text-fg-secondary"><StickyNote size={14} strokeWidth={1.5} className="shrink-0" />{contact.note}</p>
          : !contact.id && <p className="flex gap-2 rounded-lg bg-subtle p-3 text-[13px] leading-[18px] text-fg-secondary"><UserPlus size={16} className="shrink-0" strokeWidth={1.5} />{t('unknownIncomingHint')}</p>}
      </div>
      <div className="flex justify-center gap-12">{(['reject', 'accept'] as const).map(type => <div key={type} className="flex flex-col items-center gap-1.5"><button ref={type === 'accept' ? acceptRef : undefined} type="button" onClick={() => run(type)} aria-label={t(type)} className={cn('flex size-14 items-center justify-center rounded-full text-fg-on-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2', type === 'accept' ? 'bg-success hover:bg-success/90' : 'bg-danger hover:bg-danger-hover')}>{type === 'accept' ? <Phone size={22} strokeWidth={1.5} /> : <PhoneOff size={22} strokeWidth={1.5} />}</button><span className="text-xs font-medium leading-4 text-fg">{t(type)}</span><kbd className="rounded border border-line bg-subtle px-1.5 py-0.5 text-xs leading-4 text-fg-secondary">{type === 'accept' ? 'Enter' : 'Esc'}</kbd></div>)}</div>
    </div>
  </div>;
}
