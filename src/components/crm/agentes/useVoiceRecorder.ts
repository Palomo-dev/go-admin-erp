"use client";

/**
 * useVoiceRecorder — grabación de muestras de voz desde el micrófono del
 * navegador para clonar una voz en ElevenLabs (FASE 06 · brief UX 6.1).
 *
 * Usa MediaRecorder con `audio/webm` (Chrome/Edge/Firefox). Si el navegador no
 * soporta MediaRecorder o el usuario rechaza el permiso, el hook lo dice en
 * vez de fingir que grabó. Mientras graba expone `level` (0–1), el nivel del
 * micrófono medido con un AnalyserNode, para el medidor en pantalla.
 *
 * No se graba nada si el usuario no da permiso explícito del micrófono.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { RECORDER_MIME_CANDIDATES } from "@/lib/services/crm/voiceCloneScript";

export interface RecordedSample {
  file: File;
  durationSeconds: number;
}

export interface VoiceRecorderState {
  recording: boolean;
  samples: RecordedSample[];
  error: string | null;
  /** Segundos transcurridos en la grabación actual. */
  elapsed: number;
  /** Nivel del micrófono (0–1) mientras graba; 0 en reposo. */
  level: number;
  /** Soporta el navegador MediaRecorder con audio. */
  supported: boolean;
  start: () => Promise<void>;
  stop: () => void;
  removeSample: (index: number) => void;
  clear: () => void;
}

// H1 (ronda 3): los candidatos viven en `voiceCloneScript` junto a la lista blanca
// del servidor, y una prueba los cruza: lo que se graba aquí se admite allí.
function pickMime(): string | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return null;
  for (const mime of RECORDER_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

export function useVoiceRecorder(): VoiceRecorderState {
  const [recording, setRecording] = useState(false);
  const [samples, setSamples] = useState<RecordedSample[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [supported] = useState(() => pickMime() !== null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopMeter = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    setLevel(0);
  }, []);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopTimer();
      stopMeter();
      cleanupStream();
    };
  }, [stopTimer, stopMeter, cleanupStream]);

  const startMeter = useCallback((stream: MediaStream) => {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      // Voz normal ≈ 0.05–0.3 RMS: se escala para que el medidor sea legible.
      setLevel(Math.min(1, rms * 3.2));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!supported) {
      setError("Este navegador no soporta grabación de audio. Sube un archivo en su lugar.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = pickMime() ?? "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        const durationSeconds = (Date.now() - startTimeRef.current) / 1000;
        const ext = mime.includes("webm") ? "webm" : mime.includes("ogg") ? "ogg" : "mp4";
        const file = new File([blob], `muestra-${Date.now()}.${ext}`, { type: mime });
        setSamples((prev) => [...prev, { file, durationSeconds }]);
        chunksRef.current = [];
        cleanupStream();
        stopMeter();
        setRecording(false);
        setElapsed(0);
        stopTimer();
      };
      recorder.start();
      startMeter(stream);
      setRecording(true);
      startTimeRef.current = Date.now();
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);
    } catch (err) {
      cleanupStream();
      stopMeter();
      setRecording(false);
      setError(
        err instanceof Error
          ? err.name === "NotAllowedError"
            ? "Permiso de micrófono denegado. Actívalo en el navegador para grabar."
            : err.name === "NotFoundError"
              ? "No se encontró ningún micrófono. Conecta uno o sube un archivo."
              : err.message
          : "No se pudo acceder al micrófono."
      );
    }
  }, [supported, cleanupStream, stopTimer, stopMeter, startMeter]);

  const stop = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const removeSample = useCallback((index: number) => {
    setSamples((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clear = useCallback(() => {
    setSamples([]);
    setError(null);
  }, []);

  return { recording, samples, error, elapsed, level, supported, start, stop, removeSample, clear };
}
