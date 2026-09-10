'use client';

/**
 * CallControls — timer, indicador REC, mute, DTMF, audio y colgar
 * (FASE-03 §5.2). Sin "hold": Twilio Voice JS SDK no ofrece hold nativo
 * (requeriría <Enqueue>/conferencia, fuera de alcance de F3).
 */

import { useEffect, useState } from 'react';
import { Headphones, Mic, MicOff, PhoneOff, Grid3x3 } from 'lucide-react';
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
}

export function CallControls({ connectedAt, connected, recording, muted, onMute, onHangup, showKeypad, onToggleKeypad, audio }: CallControlsProps) {
  const [seconds, setSeconds] = useState(0);
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

      <div className="flex items-center justify-center gap-2">
        <Button
          type="button"
          onClick={() => onMute(!muted)}
          size="icon"
          variant={muted ? 'destructive' : 'outline'}
          disabled={!connected}
          aria-pressed={muted}
          aria-label={muted ? 'Activar micrófono (Ctrl+Shift+M)' : 'Silenciar (Ctrl+Shift+M)'}
          title={muted ? 'Activar micrófono' : 'Silenciar'}
        >
          {muted ? <MicOff size={16} /> : <Mic size={16} />}
        </Button>
        <Button
          type="button"
          onClick={onToggleKeypad}
          size="icon"
          variant={showKeypad ? 'secondary' : 'outline'}
          disabled={!connected}
          aria-pressed={showKeypad}
          aria-label="Teclado DTMF"
          title="Teclado DTMF"
        >
          <Grid3x3 size={16} />
        </Button>
        <Button
          type="button"
          onClick={() => setShowAudio((v) => !v)}
          size="icon"
          variant={showAudio ? 'secondary' : 'outline'}
          aria-pressed={showAudio}
          aria-label="Dispositivos de audio"
          title="Micrófono / altavoz"
        >
          <Headphones size={16} />
        </Button>
        <Button type="button" onClick={onHangup} variant="destructive" className="flex-1" aria-label="Colgar (Ctrl+Shift+D)">
          <PhoneOff size={16} className="mr-2" aria-hidden="true" />
          Colgar
        </Button>
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
