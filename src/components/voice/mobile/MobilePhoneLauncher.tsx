'use client';
import { useEffect, useState } from 'react';
import { Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MobileCallDialog } from '@/components/crm/shared/MobileCallDialog';
import { OPEN_SOFTPHONE_EVENT } from '../softphoneUi';
/** Entrada móvil del mismo evento del header; la llamada la inicia MobileCallDialog. */
export function MobilePhoneLauncher() {
  const t = useTranslations('phoneVisual');
  const [open, setOpen] = useState(false); const [number, setNumber] = useState('');
  useEffect(() => {
    const show = (event: Event) => {
      const candidate = (event as CustomEvent<{ number?: unknown }>).detail?.number;
      setNumber(typeof candidate === 'string' && /^\+[1-9]\d{6,14}$/.test(candidate) ? candidate : ''); setOpen(true);
    };
    window.addEventListener(OPEN_SOFTPHONE_EVENT, show); return () => window.removeEventListener(OPEN_SOFTPHONE_EVENT, show);
  }, []);
  return <>
    {!open && <button type="button" className="fixed bottom-[calc(var(--shell-barra-inferior,0px)+1rem)] right-4 z-50 flex size-12 items-center justify-center rounded-full bg-brand-action text-fg-on-brand shadow-md" aria-label={t('openPhone')} onClick={() => setOpen(true)}><Phone size={22} strokeWidth={1.5} /></button>}
    {open && <MobileCallDialog open onOpenChange={setOpen} targetPhone={number} allowNumberEdit />}
  </>;
}
