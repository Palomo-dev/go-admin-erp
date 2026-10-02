'use client';

/**
 * CallControls — timer, indicador REC, mute, DTMF, audio y colgar
 * Los controles de espera/transferencia confirman el estado nativo del servidor.
 */

import { useEffect, useState } from 'react';
import { Headphones, Mic, MicOff, PhoneOff, Grid3x3, Pause, Play, ArrowRightLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PhoneControlState, PhoneControlResult } from '@/lib/services/crm/phoneConferenceTypes';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';
import type { AudioDevicesState } from '../hooks/useAudioDevices';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface CallControlsProps {
  connectedAt: number | null;
  connected: boolean;
  recording: boolean;
  muted: boolean;
  onMute: (muted: boolean) => void;
  onHangup: () => void;
  showKeypad: boolean;
  onToggleKeypad: () => void;
  audio: AudioDevicesState;
  control: PhoneControlState;
  onHold: (held: boolean) => Promise<PhoneControlResult>;
  onTransfer: () => void;
}

export function CallControls({ connectedAt, connected, recording, muted, onMute, onHangup, showKeypad, onToggleKeypad, audio, control, onHold, onTransfer }: CallControlsProps) {
  const t = useTranslations('phoneControl');
  const [seconds, setSeconds] = useState(0);
  const [heldSeconds, setHeldSeconds] = useState(0);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const locked = pending || control.busy;
  const [showAudio, setShowAudio] = useState(false);

  useEffect(() => {
    if (!connectedAt) {
      setSeconds(0);
      return;
    }
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - connectedAt) / 1000)));
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [connectedAt]);

  useEffect(() => {
    const tick = () => setHeldSeconds(control.heldAt ? Math.max(0, Math.floor((Date.now() - control.heldAt) / 1000)) : 0);
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [control.heldAt]);
  const hold = async () => {
    if (locked) return;
    setPending(true); setHoldError(null);
    try { const result = await onHold(!control.held); if (!result.ok) setHoldError(result.message); }
    finally { setPending(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-3">
        {recording && connected && (
          <span
            className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300 motion-safe:animate-pulse"
            aria-label="Grabando"
          >
            <span className="h-2 w-2 rounded-full bg-red-600" aria-hidden="true" />
            REC
          </span>
        )}
        <span className="text-2xl font-mono font-bold tabular-nums text-gray-900 dark:text-gray-100" aria-live={seconds % 30 === 0 ? 'polite' : 'off'}>
          {formatDuration(seconds)}
        </span>
      </div>

      {control.held && (
        <div role="status" className="rounded-lg border border-line-warning bg-warning-subtle p-3 text-xs text-warning-text">
          <p className="font-semibold">{t('heldDuration', { duration: formatDuration(heldSeconds) })}</p>
          <p className="mt-1">{t(control.phase === 'consulting' ? 'consultHint' : heldSeconds >= 180 ? 'heldReminder' : 'heldExplanation')}</p>
        </div>
      )}
      {(holdError || control.error) && <p role="alert" className="text-xs text-danger-text">{holdError ?? t('controlUncertain')}</p>}
      <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
        <div><Button type="button" size="icon" variant={muted ? 'secondary' : 'outline'} className="h-12 w-12 rounded-full"
          onClick={() => onMute(!muted)} disabled={!connected || (control.held && control.phase !== 'consulting') || locked} aria-pressed={muted}
          aria-label={t(muted ? 'unmute' : 'mute')}><>{muted ? <MicOff size={20} strokeWidth={1.5} /> : <Mic size={20} strokeWidth={1.5} />}</></Button>
          <p className="mt-1">{t(muted ? 'unmute' : 'mute')}</p></div>
        <div><Button type="button" size="icon" variant={control.held ? 'default' : 'outline'} className="h-12 w-12 rounded-full"
          onClick={() => void hold()} disabled={!connected || !control.supported || locked} aria-pressed={control.held}
          aria-label={t(control.held ? 'resume' : 'hold')}><>{control.held ? <Play size={20} strokeWidth={1.5} /> : <Pause size={20} strokeWidth={1.5} />}</></Button>
          <p className="mt-1">{t(control.held ? 'resume' : 'hold')}</p></div>
        <div><Button type="button" size="icon" variant={showKeypad ? 'secondary' : 'outline'} className="h-12 w-12 rounded-full"
          onClick={onToggleKeypad} disabled={!connected || control.held || locked} aria-pressed={showKeypad} aria-label={t('keypad')}>
          <Grid3x3 size={20} strokeWidth={1.5} /></Button><p className="mt-1">{t('keypad')}</p></div>
        <div><Button type="button" size="icon" variant="outline" className="h-12 w-12 rounded-full"
          onClick={onTransfer} disabled={!connected || !control.supported || locked} aria-label={t('transfer')}>
          <ArrowRightLeft size={20} strokeWidth={1.5} /></Button><p className="mt-1">{t('transfer')}</p></div>
      </div>
      {!control.supported && connected && <p className="text-xs text-fg-secondary">{t('legacyCapability')}</p>}
      <div className="flex items-center gap-2">
        <Button type="button" onClick={() => setShowAudio((value) => !value)} size="icon" variant="outline" aria-pressed={showAudio} aria-label={t('audioDevices')}>
          <Headphones size={16} strokeWidth={1.5} /></Button>
        <Button type="button" onClick={onHangup} variant="destructive" className="flex-1" aria-label={t('hangup')}>
          <PhoneOff size={16} strokeWidth={1.5} className="mr-2" aria-hidden="true" />{t('hangup')}</Button>
      </div>

      {showAudio && (
        <div className="space-y-2 rounded-lg border border-gray-200 p-2 text-xs dark:border-gray-700">
          <label className="block">
            <span className="text-gray-500 dark:text-gray-400">Micrófono</span>
            <select
              value={audio.inputId ?? ''}
              onChange={(e) => void audio.setInputDevice(e.target.value)}
              className={cn('mt-1 h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100')}
            >
              {audio.inputs.length === 0 && <option value="">Predeterminado</option>}
              {audio.inputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-gray-500 dark:text-gray-400">Altavoz {audio.canSetOutput ? '' : '(solo Chrome/Edge)'}</span>
            <select
              value={audio.outputId ?? ''}
              onChange={(e) => void audio.setOutputDevice(e.target.value)}
              disabled={!audio.canSetOutput}
              className="mt-1 h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-xs disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              {audio.outputs.length === 0 && <option value="">Predeterminado</option>}
              {audio.outputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
