'use client';

import { Ban, CalendarClock, Clock, History, Mic, MicOff, RefreshCw, Smartphone, WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { clasesBoton } from '@/components/kit/botonClases';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import type { BlockedCallInfo } from '../softphoneTypes';
import { PhoneContact, type PhoneContactData } from './PhoneContact';
import { cn } from '@/utils/Utils';
import Link from 'next/link';
import { VOICE_PROVIDERS_SETTINGS_HREF } from './DockHeader';

export const PHONE_ACTION = 'flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-success text-sm font-medium leading-5 text-fg-on-brand hover:bg-success/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50';

export function PhoneAccessNotice({ kind, reason, busy, configurationScope, onRetry, onMobile, onRegister }: { kind: 'prompt' | 'denied' | 'unavailable'; reason?: string | null; busy?: boolean; configurationScope?: 'platform' | 'organization'; onRetry(): void; onMobile?: () => void; onRegister?: () => void }) {
  const t = useTranslations('phoneBrowser');
  const Icon = kind === 'prompt' ? Mic : kind === 'denied' ? MicOff : WifiOff;
  return <div className="flex flex-col items-start gap-4 p-4 text-left">
    <span className={cn('flex size-14 items-center justify-center rounded-full', kind === 'denied' ? 'bg-danger-subtle text-danger' : 'bg-brand-tint text-brand')}><Icon size={28} strokeWidth={1.5} /></span>
    <div className="space-y-2"><h3 className="text-base font-semibold leading-6 text-fg">{t(`${kind}Title`)}</h3><p className="text-[13px] leading-[18px] text-fg-secondary">{kind === 'unavailable' && reason ? reason : t(`${kind}Description`)}</p></div>
    {kind === 'prompt' && <p className="w-full rounded-lg border border-line-strong bg-canvas p-3 text-xs leading-4 text-fg-secondary">{t('permissionBrowserHint')}</p>}
    {kind === 'denied' && <ol className="w-full space-y-3 rounded-lg border border-line bg-canvas p-3 text-left">{[1, 2, 3].map(index => <li className="flex items-start gap-2 text-[13px] leading-[18px] text-fg" key={index}><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-subtle text-xs font-semibold text-fg-secondary">{index}</span><span>{t(`permissionStep${index}`)}</span></li>)}</ol>}
    {kind === 'unavailable' && configurationScope === 'organization' && <Link href={VOICE_PROVIDERS_SETTINGS_HREF} className="text-xs font-medium text-brand-action hover:underline">{t('openProviders')}</Link>}
    <div className="w-full space-y-2">
      {kind === 'unavailable' && onRegister && <button type="button" onClick={onRegister} className={clasesBoton({ anchoCompleto: true, patron: 'button' })}>{t('registerCall')}</button>}
      <button type="button" onClick={onRetry} disabled={busy} className={clasesBoton({ anchoCompleto: true, patron: 'button', variante: kind === 'prompt' ? 'primario' : 'secundario' })}>{kind === 'prompt' ? <Mic size={16} strokeWidth={1.5} /> : <RefreshCw size={16} strokeWidth={1.5} />}{t(kind === 'prompt' ? 'allowMicrophone' : 'retry')}</button>
      {onMobile && <button type="button" onClick={onMobile} className={clasesBoton({ anchoCompleto: true, patron: 'button', variante: kind === 'denied' ? 'primario' : 'secundario' })}><Smartphone size={16} strokeWidth={1.5} />{t('fromMobile')}</button>}
    </div>
  </div>;
}

export function PhonePreflightNotice({ blocked, contact, onSchedule, onCancel, onEmail }: { blocked: BlockedCallInfo; contact: PhoneContactData; onSchedule?: () => void; onCancel(): void; onEmail?: () => void }) {
  const t = useTranslations('phoneBrowser');
  const locale = useLocaleIntl();
  const excluded = blocked.code === 'numero_excluido' || blocked.code === 'contacto_no_autorizado';
  const weekly = blocked.code === 'tope_canal_semana' || blocked.code === 'tope_total_semana';
  const Icon = excluded ? Ban : weekly ? History : Clock;
  const prefix = excluded ? 'excluded' : weekly ? 'weekly' : 'outsideHours';
  return <div className="space-y-4 p-4">
    <PhoneContact contact={contact} card />
    <div className={cn('space-y-2 rounded-xl border p-3', excluded ? 'border-line-danger bg-danger-subtle text-danger-text' : 'border-line-warning bg-warning-subtle text-warning-text')} role="alert">
      <div className="flex items-start gap-2"><Icon size={18} strokeWidth={1.5} className="shrink-0" /><p className="text-sm font-semibold leading-5">{t(`${prefix}Title`)}</p></div>
      <p className="text-[13px] leading-[18px] text-fg">{t(`${prefix}Description`)}</p>
    </div>
    {blocked.nextAt && <dl className="space-y-2 rounded-lg bg-subtle p-3 text-xs leading-4"><div className="flex justify-between gap-3"><dt className="text-fg-secondary">{t('nextWindow')}</dt><dd className="text-right font-semibold text-fg">{formatDateTimeInTz(blocked.nextAt, blocked.timezone, { locale })}</dd></div><div className="flex justify-between gap-3"><dt className="text-fg-secondary">{t('recipientZone')}</dt><dd className="text-right text-fg">{blocked.timezone}</dd></div></dl>}
    {excluded ? <><button className={cn(PHONE_ACTION, 'bg-subtle text-fg-muted')} type="button" disabled>{t('dial')}</button>{onEmail && <button type="button" onClick={onEmail} className={clasesBoton({ anchoCompleto: true, variante: 'secundario', patron: 'button' })}>{t('emailInstead')}</button>}</>
      : onSchedule && <button type="button" onClick={onSchedule} className={clasesBoton({ anchoCompleto: true, patron: 'button' })}><CalendarClock size={16} strokeWidth={1.5} />{t('scheduleCall')}</button>}
    <button type="button" onClick={onCancel} className={clasesBoton({ anchoCompleto: true, variante: 'fantasma', patron: 'button' })}>{t('cancel')}</button>
  </div>;
}
