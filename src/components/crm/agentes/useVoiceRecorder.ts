"use client";

/**
 * useVoiceRecorder — grabación de muestras de voz desde el micrófono del
 * navegador para clonar una voz en ElevenLabs (FASE 06).
 *
 * Antes solo se podía clonar subiendo archivos de audio. Ahora el usuario puede
 * grabar directamente aquí: es más rápido y más honesto (la muestra es suya,
 * no descargada).
 *
 * Usa MediaRecorder con `audio/webm` (Chrome/Edge/Firefox). Si el navegador no
 * soporta MediaRecorder o el usuario rechaza el permiso, el hook lo dice en
 * vez de fingir que grabó.
 *
 * No se graba nada si el usuario no da permiso explícito del micrófono.
 */

import { useCallback, useEffect, useRef, useState } from "react";

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
  /** Soporta el navegador MediaRecorder con audio. */
  supported: boolean;
  start: () => Promise<void>;
  stop: () => void;
  removeSample: (index: number) => void;
  clear: () => void;
}

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

function pickMime(): string | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return null;
  for (const mime of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

export function useVoiceRecorder(): VoiceRecorderState {
  const [recording, setRecording] = useState(false);
  const [samples, setSamples] = useState<RecordedSample[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [supported] = useState(() => pickMime() !== null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
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
      cleanupStream();
    };
  }, [stopTimer, cleanupStream]);

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
        setRecording(false);
        setElapsed(0);
        stopTimer();
      };
      recorder.start();
      setRecording(true);
      startTimeRef.current = Date.now();
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);
    } catch (err) {
      cleanupStream();
      setRecording(false);
      setError(
        err instanceof Error
          ? err.name === "NotAllowedError"
            ? "Permiso de micrófono denegado. Actívalo en el navegador para grabar."
            : err.message
          : "No se pudo acceder al micrófono.",
      );
    }
  }, [supported, cleanupStream, stopTimer]);

  const stop = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  const removeSample = useCallback((index: number) => {
    setSamples((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clear = useCallback(() => {
    setSamples([]);
    setError(null);
  }, []);

  return {
    recording,
    samples,
    error,
    elapsed,
    supported,
    start,
    stop,
    removeSample,
    clear,
  };
}
