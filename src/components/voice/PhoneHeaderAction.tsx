'use client';

import { Phone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSoftphone } from './SoftphoneProvider';
import { OPEN_SOFTPHONE_EVENT, SOFTPHONE_VISIBILITY_EVENT } from './softphoneUi';
import { cn } from '@/utils/Utils';

/** Abre el mismo teléfono del shell; no inicia ni duplica un Device. */
export function PhoneHeaderAction() {
  const phone = useSoftphone();
  const t = useTranslations('phoneMirror');
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const update = (event: Event) => setVisible((event as CustomEvent<{ visible?: unknown }>).detail?.visible === true);
    window.addEventListener(SOFTPHONE_VISIBILITY_EVENT, update);
    return () => window.removeEventListener(SOFTPHONE_VISIBILITY_EVENT, update);
  }, []);
  if (!phone.available) return null;
  const connected = phone.callStatus === 'connected';
  return <button type="button" aria-label={t('title')} aria-pressed={visible} onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SOFTPHONE_EVENT, { detail: { toggle: true } }))} className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand', visible ? 'bg-brand-tint text-brand-action hover:bg-brand-tint-hover' : 'text-fg-secondary hover:bg-hover')}><span className="relative"><Phone size={16} strokeWidth={1.5} /><span className={cn('absolute -right-0.5 -top-0.5 size-1.5 rounded-full border border-surface', connected || phone.deviceState === 'registered' ? 'bg-success' : phone.deviceState === 'registering' ? 'bg-warning' : 'bg-fg-muted')} aria-hidden="true" /></span>{t('title')}</button>;
}
