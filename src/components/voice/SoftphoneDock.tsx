'use client';

/**
 * SoftphoneDock — widget flotante del softphone (FASE-03 §5.2, shell).
 * Estados: colapsado / marcador / llamando / en llamada / finalizada.
 * Subcomponentes: dock/DockHeader, dock/Keypad, dock/CallControls, dock/LiveNote.
 * Al colgar abre `CallDispositionDialog`. Debe vivir bajo <SoftphoneProvider>.
 * Atajos: Ctrl+Shift+C llamar a la entidad enfocada (`data-phone`), Ctrl+Shift+D colgar.
 */

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Phone, PhoneCall, PhoneIncoming, PhoneOff } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSoftphone } from './SoftphoneProvider';
import { DockHeader } from './dock/DockHeader';
import { Keypad } from './dock/Keypad';
import { CallControls } from './dock/CallControls';
import { LiveNote } from './dock/LiveNote';
import { CallDispositionDialog } from './CallDispositionDialog';

export function SoftphoneDock() {
  const sp = useSoftphone();
  const [number, setNumber] = useState('');
  const [collapsed, setCollapsed] = useState(true);
  const [dtmf, setDtmf] = useState('');
  const [showKeypad, setShowKeypad] = useState(false);
  const [dispositionOpen, setDispositionOpen] = useState(false);

  const makeCall = sp.available ? sp.makeCall : null;
  const lastEnded = sp.available ? sp.lastEndedCall : null;

  // Abre el diálogo de disposición al terminar una llamada (con fila `calls` o no).
  useEffect(() => {
    if (lastEnded) setDispositionOpen(true);
  }, [lastEnded]);

  // Ctrl+Shift+C: llama a la entidad enfocada (elemento con data-phone) o expande el dock.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey && e.shiftKey && e.key.toUpperCase() === 'C')) return;
      const el = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-phone]');
      const phone = el?.dataset.phone;
      e.preventDefault();
      if (phone && makeCall) {
        void makeCall(phone, { opportunityId: el?.dataset.opportunityId ?? null, customerId: el?.dataset.customerId ?? null, displayName: el?.dataset.displayName ?? null });
      } else {
        setCollapsed(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [makeCall]);

  const handleCall = useCallback(() => {
    const trimmed = number.trim();
    if (!trimmed || !makeCall) return;
    void makeCall(trimmed);
  }, [number, makeCall]);

  useEffect(() => {
    if (sp.available && (sp.callStatus === 'connecting' || sp.hasIncoming)) setCollapsed(false);
  }, [sp]);

  if (!sp.available) return null;

  const { deviceState, deviceReason, deviceMissing, deviceScope, callStatus, activeCall, activeCallId, activeCallRow, muted, hasIncoming, incoming, liveNote, setLiveNote, audio } = sp;
  const inCall = callStatus === 'connecting' || callStatus === 'ringing' || callStatus === 'connected';
  const connected = callStatus === 'connected';
  const recording = Boolean(activeCallRow?.recording_enabled);

  return (
    <>
      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
          aria-label={`Abrir softphone (${deviceState === 'registered' ? 'listo' : deviceReason ?? deviceState})`}
          title={deviceState === 'registered' ? 'Softphone listo' : deviceReason ?? 'Softphone'}
        >
          <PhoneCall size={22} aria-hidden="true" />
          <span
            className={`absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-gray-900 ${
              connected ? 'bg-green-500 motion-safe:animate-pulse' : hasIncoming ? 'bg-yellow-400 motion-safe:animate-ping' : deviceState === 'registered' ? 'bg-green-500' : deviceState === 'not_configured' ? 'bg-gray-400' : 'bg-red-500'
            }`}
            aria-hidden="true"
          />
        </button>
      ) : (
        <AnimatePresence>
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed bottom-0 right-0 z-50 w-full sm:bottom-4 sm:right-4 sm:w-[340px]"
          >
            <Card role="region" aria-label="Softphone" className="rounded-none border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800 sm:rounded-xl">
              <DockHeader deviceState={deviceState} deviceReason={deviceReason} deviceMissing={deviceMissing} deviceScope={deviceScope} callStatus={callStatus} onMinimize={() => setCollapsed(true)} onRetry={sp.retry} />

              <div className="space-y-3 p-4">
                {hasIncoming && incoming && (
                  <div className="space-y-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
                    <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                      <PhoneIncoming size={16} aria-hidden="true" />
                      <span className="text-sm font-medium">Llamada entrante · {incoming.from}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={sp.acceptIncoming} size="sm" className="flex-1 bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700">
                        <Phone size={14} className="mr-1" aria-hidden="true" />
                        Aceptar
                      </Button>
                      <Button onClick={sp.rejectIncoming} size="sm" variant="destructive" className="flex-1">
                        <PhoneOff size={14} className="mr-1" aria-hidden="true" />
                        Rechazar
                      </Button>
                    </div>
                  </div>
                )}

                {inCall && !hasIncoming && activeCall && (
                  <div className="text-center" aria-live="assertive">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{activeCall.displayName ?? activeCall.number}</p>
                    {activeCall.displayName && <p className="text-xs text-gray-500 dark:text-gray-400">{activeCall.number}</p>}
                    {!connected && <p className="text-xs text-yellow-700 dark:text-yellow-300 motion-safe:animate-pulse">{callStatus === 'ringing' ? 'Timbrando…' : 'Conectando…'}</p>}
                  </div>
                )}

                {inCall && !hasIncoming && (
                  <>
                    <CallControls
                      connectedAt={activeCall?.connectedAt ?? null}
                      connected={connected}
                      recording={recording}
                      muted={muted}
                      onMute={sp.mute}
                      onHangup={sp.hangup}
                      showKeypad={showKeypad}
                      onToggleKeypad={() => setShowKeypad((v) => !v)}
                      audio={audio}
                    />
                    {showKeypad && connected && <Keypad value={dtmf} onChange={setDtmf} onSubmit={() => undefined} dtmfMode onDigit={sp.sendDigits} />}
                    <LiveNote callId={activeCallId} value={liveNote} onChange={setLiveNote} />
                  </>
                )}

                {!inCall && !hasIncoming && (
                  <>
                    <Keypad value={number} onChange={setNumber} onSubmit={handleCall} disabled={deviceState !== 'registered'} />
                    <Button
                      onClick={handleCall}
                      disabled={!number.trim() || deviceState !== 'registered'}
                      className="w-full bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
                    >
                      <Phone size={16} className="mr-2" aria-hidden="true" />
                      Llamar
                    </Button>
                  </>
                )}
              </div>
            </Card>
          </motion.div>
        </AnimatePresence>
      )}

      {lastEnded && (
        <CallDispositionDialog
          open={dispositionOpen}
          ended={lastEnded}
          onClose={() => {
            setDispositionOpen(false);
            sp.clearLastEndedCall();
            setDtmf('');
            setShowKeypad(false);
          }}
        />
      )}
    </>
  );
}
