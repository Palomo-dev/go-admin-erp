'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, CheckCircle2, Clock, Loader2, Phone, PhoneOff, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { PhoneDialPad } from '../desktop/PhoneDialPad';
import { LiveNote } from '../dock/LiveNote';
import { useMobileCommercialContext } from './useMobileCommercialContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatearTelefono } from '@/lib/utils/telefono';
import { usePhoneContext } from '../dock/usePhoneContext';
import { AccionesRapidasCrm } from '@/components/crm/acciones/AccionesRapidasCrm';
import { maskPhone, isTerminalBridgeStatus } from '@/lib/services/crm/bridgeState';
interface Props {
  showHeader?: boolean;
  number: string; onNumberChange?: (value: string) => void; customerId: string | null; customerName: string | null; opportunityId: string | null;
  mobile: string | null; loadingPrefs: boolean; submitting: boolean; canceling: boolean; status: string | null; callId: string | null;
  call: { answered_at: string | null; recording_enabled: boolean; consent_given: boolean; recording_started?: boolean } | null;
  note: string; onNote: (value: string) => void; error: string | null;
  onStart: () => void; onCancel: () => void; onClose: () => void; onResult: () => void;
}
const FOLLOWUP_ACTIONS = ['tarea', 'reunion'] as const;
/** Sólo presentación del mismo bridge; nunca simula un Device móvil ni audio WebRTC. */
export function MobileBridgeView(p: Props) {
  const t = useTranslations('phoneVisual');
  const [now, setNow] = useState(Date.now()); const [numberFocused, setNumberFocused] = useState(false);
  const { contact } = usePhoneContext(p.number, null, Boolean(p.number));
  const name = p.customerName ?? contact?.name ?? p.number;
  const dates = useFormatDate(null); const currency = useMonedaOrganizacion();
  const active = p.status === 'in_progress'; const finished = isTerminalBridgeStatus(p.status); const dialing = Boolean(p.status) && !active && !finished;
  useEffect(() => { if (!active) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [active]);
  const seconds = p.call?.answered_at ? Math.max(0, Math.floor((now - Date.parse(p.call.answered_at)) / 1000)) : null;
  const duration = seconds === null ? '—' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const commercial = useMobileCommercialContext(p.opportunityId, active);
  const displayNumber = formatearTelefono(p.number) || p.number;
  const title = active ? t('inCall') : dialing ? t('calling', { name }) : finished ? t('ended') : t('phone');
  return <section className="flex min-h-0 flex-1 flex-col bg-canvas text-fg">
    {p.showHeader !== false && <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface pl-2 pr-3"><Button variant="ghost" size="icon" className="size-10 text-fg-secondary" aria-label={t('back')} onClick={p.onClose}><ArrowLeft size={20} strokeWidth={1.5} /></Button><h1 className="min-w-0 truncate text-base font-semibold leading-[22px]">{title}</h1></header>}
    <div className={`flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 ${dialing ? 'justify-center' : ''}`}>
      {p.error && <p role="alert" className="rounded-lg bg-danger-subtle p-3 text-xs leading-4 text-danger-text">{p.error}</p>}
      {!p.status && <>
        <input type="tel" inputMode="tel" value={numberFocused ? p.number : displayNumber} onFocus={() => setNumberFocused(true)} onBlur={() => setNumberFocused(false)} readOnly={!p.onNumberChange} onChange={event => p.onNumberChange?.(event.target.value.replace(/[^0-9+ ()-]/g, '').slice(0, 40))} aria-label={t('number')} placeholder={t('number')} className="h-14 w-full min-w-0 border-0 bg-transparent px-0 text-center text-[28px] font-semibold leading-9 tracking-[-.4px] outline-none focus-visible:ring-2 focus-visible:ring-brand" />
        {name && <div className="flex items-center gap-2.5 rounded-[10px] bg-brand-tint px-3 py-2.5"><AvatarIniciales nombre={name} tamano="sm" className="bg-brand font-medium" /><div className="min-w-0"><p className="truncate text-sm font-medium leading-5">{name}</p><p className="truncate text-xs font-medium leading-4 text-fg-secondary">{contact?.company ?? p.number}</p></div></div>}
        {p.onNumberChange && <div className="mx-auto w-full max-w-[318px] py-1"><PhoneDialPad diseno="kit" sinNumero value={p.number} disabled={p.submitting} onChange={p.onNumberChange} onDigit={() => undefined} onSubmit={p.onStart} /></div>}
        <div className="flex items-start gap-2 rounded-lg border border-line bg-surface/60 px-3 py-2 text-xs font-medium leading-4 text-fg-secondary"><Smartphone size={16} strokeWidth={1.5} className="mt-1 shrink-0" /><p>{p.loadingPrefs ? t('checkingMobile') : p.mobile ? t('bridgeHint', { mobile: maskPhone(p.mobile) }) : t('verifyMobile')}</p></div>
        {!p.mobile && !p.loadingPrefs && <a className="text-xs font-medium text-link underline" href="/app/configuracion/crm/telefonia">{t('configureMobile')}</a>}
        <div className="flex justify-center"><Button disabled={!p.mobile || p.loadingPrefs || p.submitting || !p.number.trim()} className="size-14 rounded-full bg-success p-0 hover:bg-success-text" aria-label={t('call')} onClick={p.onStart}>{p.submitting ? <Loader2 className="animate-spin" size={24} /> : <Phone size={24} strokeWidth={1.5} />}</Button></div>
      </>}
      {dialing && <>
        <div className="mb-2 flex flex-col items-center gap-4 py-3"><AvatarIniciales nombre={name} tamano="md" className="size-12 bg-brand text-base font-medium" /><div className="text-center"><h2 className="text-[22px] font-semibold leading-7 tracking-[-.2px]">{name}</h2><p className="mt-1 text-[13px] leading-[18px] text-fg-secondary">{displayNumber}{contact?.company ? ` · ${contact.company}` : ''}</p></div></div>
        <ol className="overflow-hidden rounded-xl border border-line bg-surface" aria-live="polite">{[
          { title: t('step1'), hint: p.mobile ? t('mobileNumber', { mobile: maskPhone(p.mobile) }) : '—' },
          { title: t('step2'), hint: t('step2Hint') },
          { title: t('step3', { name }), hint: t('step3Hint') },
        ].map((step, index) => { const progress = p.status === 'customer_dialing' ? 2 : ['agent_answered', 'agent_ringing'].includes(p.status ?? '') ? 1 : 0; const Icon = index < progress ? CheckCircle2 : index === progress ? Loader2 : Clock; return <li key={index} className="flex items-center gap-3 border-b border-line px-3.5 py-3 last:border-0"><Icon size={18} strokeWidth={1.5} className={index < progress ? 'text-success' : index === progress ? 'animate-spin text-brand' : 'text-fg-muted'} /><div><p className="text-sm font-medium leading-5">{index + 1}. {step.title}</p><p className="mt-0.5 text-xs font-medium leading-4 text-fg-secondary">{step.hint}</p></div></li>; })}</ol>
        <Button variant="outline" disabled={p.canceling} className="mt-2 h-10 w-full border-line-strong text-sm" onClick={p.onCancel}><PhoneOff size={18} strokeWidth={1.5} className="mr-2" />{t('cancelCall')}</Button>
      </>}
      {active && <>
        <div className="flex items-center gap-3 rounded-xl border border-line-success bg-success-subtle p-3"><AvatarIniciales nombre={name} tamano="md" className="bg-brand font-medium" /><div className="min-w-0 flex-1"><h2 className="truncate text-base font-semibold leading-[22px]">{name}</h2><p className="mt-0.5 text-xs font-medium leading-4 text-success-text">{t('runningOnPhone')} · {duration}</p></div>{p.call?.recording_enabled && p.call.consent_given && p.call.recording_started && <Badge tono="peligro" tamano="sm">{t('recording')}</Badge>}</div>
        {(commercial || contact?.opportunity || contact?.company) && <div className="space-y-2 rounded-xl border border-line bg-surface p-3.5"><h3 className="text-xs font-semibold leading-4 text-fg-secondary">{t('context')}</h3>
          {commercial ? <dl className="grid grid-cols-[92px_1fr] gap-x-3 gap-y-2 text-xs leading-4"><dt className="text-fg-secondary">{t('opportunity')}</dt><dd>{commercial.name}{currency.resuelta && commercial.amount != null ? ` · ${currency.formatear(commercial.amount)}` : ''}</dd>
            {commercial.etapa?.name && <><dt className="text-fg-secondary">{t('stage')}</dt><dd>{commercial.etapa.name}</dd></>}
            {commercial.last_contact_at && <><dt className="text-fg-secondary">{t('lastContact')}</dt><dd>{dates.formatDate(commercial.last_contact_at)}{commercial.last_contact_result ? ` · ${commercial.last_contact_result}` : ''}</dd></>}
          </dl> : <>{contact?.company && <p className="text-xs leading-4">{contact.company}</p>}{contact?.opportunity && <p className="text-xs leading-4">{contact.opportunity.name}</p>}</>}
        </div>}
        <div className="[&_textarea]:h-[108px] [&_textarea]:min-h-[108px]"><LiveNote diseno="kit" callId={p.callId} value={p.note} onChange={p.onNote} /></div>
        <AccionesRapidasCrm variante="drawer" className="flex-nowrap [&>span]:min-w-0 [&>span]:flex-1 [&_button]:w-full [&_button]:justify-center" acciones={FOLLOWUP_ACTIONS} clienteId={p.customerId ?? contact?.id} oportunidadId={p.opportunityId} cliente={{ id: p.customerId ?? contact?.id, full_name: name, phone: p.number }} />
        <Button variant="destructive" disabled={p.canceling} className="h-11 w-full rounded-lg bg-danger text-sm font-medium" onClick={p.onCancel}><PhoneOff size={18} strokeWidth={1.5} className="mr-2" />{t('hangup')}</Button>
      </>}
      {finished && <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center"><AvatarIniciales nombre={name} tamano="lg" className="bg-brand" /><h2 className="text-[22px] font-semibold leading-7">{name}</h2><p role="status" className="text-sm text-fg-secondary">{t(`status.${p.status}`)}</p><Button disabled={!p.callId || !p.call} className="h-10 w-full bg-brand-action text-sm" onClick={p.onResult}>{t('registerResult')}</Button></div>}
    </div>
  </section>;
}
