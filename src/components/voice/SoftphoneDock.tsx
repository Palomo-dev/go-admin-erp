'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, Phone, PhoneCall, PhoneOff, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, SlideUp } from '@/components/shared/motion';
import { Card } from '@/components/ui/card';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { queryMicrophonePermission, requestMicrophone, type MicrophonePermission } from '@/lib/services/voice/platformCapabilities';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { aFechaHoraLocal } from '@/components/crm/kit/fechasCrm';
import { useCallModePolicy } from './hooks/useCallModePolicy';
import { useMobilePhoneViewport } from './mobile/useMobilePhoneViewport';
import { MobilePhoneLauncher } from './mobile/MobilePhoneLauncher';
import { useSoftphone } from './SoftphoneProvider';
import { DockHeader } from './dock/DockHeader';
import { Keypad } from './dock/Keypad';
import { CallControls } from './dock/CallControls';
import { TransferPanel } from './dock/TransferPanel';
import { LiveNote } from './dock/LiveNote';
import { PhoneContact } from './dock/PhoneContact';
import { RegisterPhoneCallDialog } from './dock/RegisterPhoneCallDialog';
import { usePhoneContext } from './dock/usePhoneContext';
import { PhoneAccessNotice, PhonePreflightNotice, PHONE_ACTION } from './dock/PhoneNotice';
import { CallDispositionDialog } from './CallDispositionDialog';
import { OPEN_SOFTPHONE_EVENT, SOFTPHONE_VISIBILITY_EVENT } from './softphoneUi';
import { cn } from '@/utils/Utils';

const MobileCallDialog = dynamic(() => import('@/components/crm/shared/MobileCallDialog').then(module => module.MobileCallDialog), { ssr: false });
const TaskDialog = dynamic(() => import('@/components/crm/shared/TaskDialog').then(module => module.TaskDialog), { ssr: false });
const ComposeEmailDialog = dynamic(() => import('@/components/crm/shared/ComposeEmailDialog').then(module => module.ComposeEmailDialog), { ssr: false });
const AccionesRapidasCrm = dynamic(() => import('@/components/crm/acciones/AccionesRapidasCrm').then(module => module.AccionesRapidasCrm), { ssr: false });

/** Un único teléfono: la presentación consume el provider y los formularios canónicos del CRM. */
export function SoftphoneDock() {
  const mobile = useMobilePhoneViewport();
  const { decision } = useCallModePolicy();
  return mobile && decision?.mode === 'mobile' ? <MobilePhoneLauncher /> : <BrowserPhoneDock />;
}

export function BrowserPhoneDock() {
  const sp = useSoftphone();
  const t = useTranslations('phoneBrowser');
  const { organization } = useOrganization();
  const organizationId = organization?.id ?? null;
  const { timezone } = useFormatDate();
  const [number, setNumber] = useState('');
  const [collapsed, setCollapsed] = useState(true);
  const [dtmf, setDtmf] = useState('');
  const [showKeypad, setShowKeypad] = useState(false);
  const [dispositionOpen, setDispositionOpen] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [registerKey, setRegisterKey] = useState<number | null>(null);
  const [permission, setPermission] = useState<MicrophonePermission>('unknown');
  const [requesting, setRequesting] = useState(false);
  const permissionAttempt = useRef(0);
  const permissionScope = useRef(organizationId);
  permissionScope.current = organizationId;
  const activeCall = sp.available ? sp.activeCall : null;
  const blocked = sp.available ? sp.blockedCall ?? null : null;
  const targetNumber = activeCall?.number ?? blocked?.number ?? number;
  const context = usePhoneContext(targetNumber, activeCall, !collapsed && sp.available);
  const contact = context.contact ?? { id: blocked?.customerId ?? null, name: blocked?.displayName ?? activeCall?.displayName ?? null, number: targetNumber };
  const displayedSid = activeCall?.callSid;
  const deviceState = sp.available ? sp.deviceState : null;
  const callStatus = sp.available ? sp.callStatus : null;
  const hasIncoming = sp.available && sp.hasIncoming;
  const makeCall = sp.available ? sp.makeCall : null;
  const lastEnded = sp.available ? sp.lastEndedCall : null;

  useEffect(() => { setShowTransfer(false); setShowKeypad(false); setDtmf(''); }, [displayedSid]);
  useEffect(() => { permissionAttempt.current += 1; setRequesting(false); setNumber(''); setMobileOpen(false); setTaskOpen(false); setEmailOpen(false); setRegisterKey(null); setPermission('unknown'); }, [organizationId]);
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ number?: unknown; toggle?: unknown }>).detail;
      const candidate = detail?.number;
      if (typeof candidate === 'string' && /^\+[1-9]\d{6,14}$/.test(candidate)) setNumber(candidate);
      setCollapsed(value => detail?.toggle === true ? !value : false);
    };
    window.addEventListener(OPEN_SOFTPHONE_EVENT, open);
    return () => window.removeEventListener(OPEN_SOFTPHONE_EVENT, open);
  }, []);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(SOFTPHONE_VISIBILITY_EVENT, { detail: { visible: sp.available && !collapsed && !hasIncoming } }));
    return () => { window.dispatchEvent(new CustomEvent(SOFTPHONE_VISIBILITY_EVENT, { detail: { visible: false } })); };
  }, [collapsed, hasIncoming, sp.available]);
  useEffect(() => { if (lastEnded) setDispositionOpen(true); }, [lastEnded]);
  useEffect(() => { if (callStatus === 'connecting' || blocked) setCollapsed(false); }, [callStatus, blocked]);
  useEffect(() => {
    if (collapsed || !deviceState) return;
    let current = true;
    void queryMicrophonePermission().then(value => { if (current) setPermission(value); });
    return () => { current = false; };
  }, [collapsed, deviceState, organizationId]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey && event.shiftKey && event.key.toUpperCase() === 'C')) return;
      const element = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-phone]');
      event.preventDefault();
      if (element?.dataset.callMode === 'mobile') { element.click(); return; }
      if (element?.dataset.phone && makeCall) void makeCall(element.dataset.phone, { opportunityId: element.dataset.opportunityId ?? null, customerId: element.dataset.customerId ?? null, displayName: element.dataset.displayName ?? null });
      else setCollapsed(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [makeCall]);

  const handleCall = useCallback(() => {
    if (!number.trim() || !makeCall) return;
    void makeCall(number.trim(), { customerId: context.contact?.id ?? undefined, displayName: context.contact?.name ?? undefined });
  }, [number, makeCall, context.contact]);
  const grant = async () => {
    if (requesting || !sp.available) return;
    const attempt = ++permissionAttempt.current;
    const scope = organizationId;
    setRequesting(true);
    try { const result = await requestMicrophone(); if (permissionAttempt.current !== attempt || permissionScope.current !== scope) return; setPermission(result.granted ? 'granted' : result.reason === 'denied' ? 'denied' : 'unknown'); if (result.granted) sp.retry(); }
    finally { if (permissionAttempt.current === attempt && permissionScope.current === scope) setRequesting(false); }
  };

  if (!sp.available) return null;
  const inCall = callStatus === 'connecting' || callStatus === 'ringing' || callStatus === 'connected';
  const connected = callStatus === 'connected';
  const recording = Boolean(sp.activeCallRow?.recording_enabled && sp.activeCallRow?.consent_given && sp.activeCallRow?.recording_started);
  const access = !inCall && !blocked && (deviceState === 'no_permission' || permission === 'denied' ? 'denied' : permission === 'prompt' && deviceState === 'registered' ? 'prompt' : deviceState === 'not_configured' || deviceState === 'error' || deviceState === 'unregistered' ? 'unavailable' : null);
  const inputName = sp.audio.inputs.find(input => input.deviceId === sp.audio.inputId)?.label;
  const subtitle = blocked ? t(blocked.code === 'numero_excluido' || blocked.code === 'contacto_no_autorizado' ? 'excludedTitle' : blocked.code === 'tope_canal_semana' || blocked.code === 'tope_total_semana' ? 'weeklyTitle' : 'outsideHoursTitle') : access === 'denied' ? t('microphoneBlocked') : access === 'prompt' ? t('withoutMicrophone') : callStatus === 'connecting' ? t('connecting') : callStatus === 'ringing' ? t('ringing') : connected ? [t(sp.muted ? 'muted' : 'connected'), inputName].filter(Boolean).join(' · ') : inputName ? `${t('ready')} · ${t('microphone')}: ${inputName}` : undefined;
  const register = () => setRegisterKey(Date.now());

  return <>
    {!hasIncoming && (collapsed ? <button type="button" onClick={() => setCollapsed(false)} className="fixed bottom-4 right-4 z-50 flex size-12 items-center justify-center rounded-full bg-brand-action text-fg-on-brand shadow-lg hover:bg-brand-action-hover max-lg:bottom-[calc(var(--shell-barra-inferior,0px)+1rem)]" aria-label={t('openPhone')}>
      <PhoneCall size={22} strokeWidth={1.5} /><span className={cn('absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-surface', connected || deviceState === 'registered' ? 'bg-success' : 'bg-fg-muted')} />
    </button> : <AnimatePresence><SlideUp className="fixed bottom-4 right-4 z-50 w-[360px] max-w-[calc(100vw-32px)] max-lg:bottom-[calc(var(--shell-barra-inferior,0px)+1rem)]">
      <Card role="region" aria-label="Softphone" className="max-h-[calc(100dvh-32px)] overflow-y-auto rounded-2xl border-line bg-surface text-fg shadow-[0px_2px_6px_0px_rgba(15,23,42,0.06),0px_12px_32px_-4px_rgba(15,23,42,0.14)] dark:border-line dark:bg-surface">
        <DockHeader diseno="kit" held={sp.phoneControl.held} deviceState={sp.deviceState} deviceReason={sp.deviceReason} deviceMissing={sp.deviceMissing} deviceScope={sp.deviceScope} callStatus={sp.callStatus} subtitle={subtitle} onMinimize={() => setCollapsed(true)} onRetry={sp.retry} />
        {blocked ? <PhonePreflightNotice blocked={blocked} contact={contact} onCancel={() => sp.clearBlockedCall?.()} onSchedule={blocked.nextAt ? () => setTaskOpen(true) : undefined} onEmail={contact.email ? () => setEmailOpen(true) : undefined} />
          : access ? <PhoneAccessNotice kind={access} reason={sp.deviceReason} busy={requesting} configurationScope={sp.deviceScope} onRetry={access === 'prompt' ? () => { void grant(); } : sp.retry} onMobile={() => setMobileOpen(true)} onRegister={access === 'unavailable' ? register : undefined} />
            : <div className="space-y-4 p-4">
              {inCall && activeCall ? <>
                <PhoneContact contact={contact} centered={!connected} card={connected} reduced={showKeypad || showTransfer || sp.phoneControl.held} pulse={callStatus === 'ringing'} />
                {!connected && <><p className="flex items-center justify-center" role="status"><span className="inline-flex items-center gap-1.5 rounded-full border border-line-warning bg-warning-subtle px-2 py-0.5 text-xs font-medium leading-4 text-warning-text">{callStatus === 'ringing' ? <PhoneCall size={13} strokeWidth={1.5} /> : <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />}{t(callStatus === 'ringing' ? 'ringing' : 'connecting')}</span></p><p className="rounded-lg bg-subtle px-3 py-2 text-center text-xs leading-4 text-fg-secondary">{t(callStatus === 'ringing' ? 'ringingHint' : sp.activeCallRow?.recording_enabled ? 'recordingPendingHint' : 'recordingOffHint')}</p></>}
                {connected && (showTransfer ? <TransferPanel diseno="kit" state={sp.phoneControl} onTransfer={sp.transferCall} onConfirm={sp.confirmTransfer} onCancel={sp.cancelTransfer} onClose={() => setShowTransfer(false)} /> : <CallControls diseno="kit" sinColgar connectedAt={activeCall.connectedAt} connected recording={recording} muted={sp.muted} onMute={sp.mute} onHangup={sp.hangup} showKeypad={showKeypad} onToggleKeypad={() => setShowKeypad(value => !value)} audio={sp.audio} control={sp.phoneControl} onHold={sp.setHold} onTransfer={() => setShowTransfer(true)} teclado={showKeypad && !sp.phoneControl.held && !sp.phoneControl.busy ? <Keypad diseno="kit" value={dtmf} onChange={setDtmf} onSubmit={() => undefined} dtmfMode onDigit={sp.sendDigits} /> : undefined} />)}
                {connected && !showKeypad && !showTransfer && !sp.phoneControl.held && sp.activeCallRow?.can_edit_notes !== false && <LiveNote diseno="kit" callId={sp.activeCallId} value={sp.liveNote} onChange={sp.setLiveNote} />}
                {!showTransfer && <button type="button" onClick={sp.hangup} className={cn(PHONE_ACTION, 'bg-danger hover:bg-danger-hover')}><PhoneOff size={18} strokeWidth={1.5} />{t(connected ? 'hangup' : 'cancel')}</button>}
              </> : <>
                <Keypad diseno="kit" value={number} onChange={value => { setNumber(value); sp.clearBlockedCall?.(); }} onSubmit={handleCall} disabled={deviceState !== 'registered'} despuesNumero={context.contact ? <PhoneContact compact contact={context.contact} /> : undefined} />
                <button type="button" onClick={handleCall} disabled={!number.trim() || deviceState !== 'registered'} className={PHONE_ACTION}><Phone size={18} strokeWidth={1.5} />{t('dial')}</button>
              </>}
            </div>}
        {!inCall && !blocked && !access && <div className="flex items-center gap-2 border-t border-line px-4 py-3 text-xs font-medium leading-4"><div className="min-w-0 flex-1"><p className="text-fg-secondary">{t('callerId')}</p><p className="truncate text-fg">{context.line?.e164 ?? t('configuredLine')}{context.line?.label ? ` · ${context.line.label}` : ''}</p></div><button type="button" disabled={!number.trim()} onClick={() => setMobileOpen(true)} className="flex items-center gap-1.5 text-brand-action disabled:opacity-50"><Smartphone size={14} strokeWidth={1.5} />{t('fromMobileShort')}</button></div>}
      </Card>
    </SlideUp></AnimatePresence>)}
    {lastEnded && <CallDispositionDialog open={dispositionOpen} ended={lastEnded} onClose={() => { setDispositionOpen(false); sp.clearLastEndedCall(); setDtmf(''); setShowKeypad(false); }} />}
    {mobileOpen && <MobileCallDialog open allowNumberEdit={!targetNumber.trim()} targetPhone={targetNumber} customerId={contact.id ?? undefined} customerName={contact.name ?? undefined} opportunityId={activeCall?.opportunityId ?? blocked?.opportunityId ?? undefined} onOpenChange={setMobileOpen} />}
    {taskOpen && blocked?.nextAt && <TaskDialog open onOpenChange={setTaskOpen} relatedType={blocked.opportunityId ? 'opportunity' : contact.id ? 'customer' : undefined} relatedId={blocked.opportunityId ?? contact.id ?? undefined} customerId={contact.id ?? undefined} defaultTitle={`${t('dial')}: ${contact.name ?? targetNumber}`} defaultDueDate={aFechaHoraLocal(blocked.nextAt, timezone)} />}
    {emailOpen && contact.id && <ComposeEmailDialog open customerId={contact.id} customer={{ id: contact.id, full_name: contact.name, email: contact.email ?? null }} onOpenChange={setEmailOpen} />}
    {registerKey && (contact.id ? <AccionesRapidasCrm variante="cliente" clienteId={contact.id} cliente={{ id: contact.id, full_name: contact.name, phone: targetNumber }} sinBarra abrirAccion={{ accion: 'llamar', clave: registerKey, modoLlamada: 'registrar' }} onCerrado={() => setRegisterKey(null)} /> : <RegisterPhoneCallDialog onClose={() => setRegisterKey(null)} />)}
  </>;
}
