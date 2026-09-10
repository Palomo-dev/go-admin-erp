'use client';

/**
 * useAudioDevices — micrófono/altavoz del Device (FASE-03 §5.2 AudioDeviceSelector).
 * `device.audio.availableInputDevices/availableOutputDevices`; `speakerDevices.set`
 * solo donde el navegador lo soporta (Chromium). Persiste en localStorage
 * `goadmin.voice.audio`.
 */

import { useCallback, useEffect, useState, type MutableRefObject } from 'react';
import type { Device } from '@twilio/voice-sdk';

export interface AudioDeviceOption {
  deviceId: string;
  label: string;
}

export interface AudioDevicesState {
  inputs: AudioDeviceOption[];
  outputs: AudioDeviceOption[];
  inputId: string | null;
  outputId: string | null;
  canSetOutput: boolean;
  setInputDevice: (id: string) => Promise<void>;
  setOutputDevice: (id: string) => Promise<void>;
}

const STORAGE_KEY = 'goadmin.voice.audio';

function readPrefs(): { inputId?: string; outputId?: string } {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writePrefs(p: { inputId?: string | null; outputId?: string | null }) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readPrefs(), ...p }));
  } catch {
    /* noop */
  }
}

function toOptions(map: Map<string, MediaDeviceInfo> | undefined, kind: string): AudioDeviceOption[] {
  if (!map) return [];
  return Array.from(map.values()).map((d, i) => ({ deviceId: d.deviceId, label: d.label || `${kind} ${i + 1}` }));
}

export function useAudioDevices(deviceRef: MutableRefObject<Device | null>, ready: boolean): AudioDevicesState {
  const [inputs, setInputs] = useState<AudioDeviceOption[]>([]);
  const [outputs, setOutputs] = useState<AudioDeviceOption[]>([]);
  const [inputId, setInputId] = useState<string | null>(null);
  const [outputId, setOutputId] = useState<string | null>(null);
  const [canSetOutput, setCanSetOutput] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const device = deviceRef.current;
    const audio = device?.audio;
    if (!audio) return;
    const refresh = () => {
      setInputs(toOptions(audio.availableInputDevices, 'Micrófono'));
      setOutputs(toOptions(audio.availableOutputDevices, 'Altavoz'));
      setCanSetOutput(Boolean(audio.isOutputSelectionSupported));
      const current = audio.inputDevice?.deviceId ?? null;
      if (current) setInputId(current);
    };
    refresh();
    audio.on('deviceChange', refresh);
    const prefs = readPrefs();
    if (prefs.inputId && audio.availableInputDevices?.has(prefs.inputId)) {
      audio.setInputDevice(prefs.inputId).then(() => setInputId(prefs.inputId ?? null)).catch(() => undefined);
    }
    if (prefs.outputId && audio.isOutputSelectionSupported && audio.availableOutputDevices?.has(prefs.outputId)) {
      audio.speakerDevices.set(prefs.outputId).then(() => setOutputId(prefs.outputId ?? null)).catch(() => undefined);
    }
    return () => {
      audio.removeListener('deviceChange', refresh);
    };
  }, [deviceRef, ready]);

  const setInputDevice = useCallback(
    async (id: string) => {
      const audio = deviceRef.current?.audio;
      if (!audio) return;
      await audio.setInputDevice(id);
      setInputId(id);
      writePrefs({ inputId: id });
    },
    [deviceRef]
  );

  const setOutputDevice = useCallback(
    async (id: string) => {
      const audio = deviceRef.current?.audio;
      if (!audio || !audio.isOutputSelectionSupported) return;
      await audio.speakerDevices.set(id);
      await audio.ringtoneDevices.set(id).catch(() => undefined);
      setOutputId(id);
      writePrefs({ outputId: id });
    },
    [deviceRef]
  );

  return { inputs, outputs, inputId, outputId, canSetOutput, setInputDevice, setOutputDevice };
}
