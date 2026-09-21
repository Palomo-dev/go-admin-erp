"use client";

/**
 * useAudioPreview — un solo reproductor para toda la pantalla de voces.
 *
 * Pulsar «Escuchar» en una tarjeta detiene la que estuviera sonando: nunca hay
 * dos voces a la vez. Expone el estado por id para que cada tarjeta pinte su
 * onda animada solo cuando le toca.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type PreviewStatus = "idle" | "loading" | "playing" | "error";

export interface AudioPreviewState {
  activeId: string | null;
  status: PreviewStatus;
  error: string | null;
}

export interface AudioPreviewApi extends AudioPreviewState {
  /** Reproduce `url` para `id`; si ya sonaba ese id, lo detiene (alternar). */
  toggle: (id: string, url: string) => void;
  stop: () => void;
  statusFor: (id: string) => PreviewStatus;
}

/** Si la muestra no empieza a sonar en este tiempo, se avisa en vez de dejar el botón bloqueado. */
const LOAD_TIMEOUT_MS = 12_000;

export function useAudioPreview(): AudioPreviewApi {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tester UXM-D: cada `play()` lleva un número de secuencia. Cambiar de voz mientras
  // la anterior carga hace que `pause()`/`src` rechacen su promesa con AbortError;
  // sin este guardia, el catch de la PRIMERA voz pisaba el estado de la SEGUNDA.
  const seqRef = useRef(0);
  const [state, setState] = useState<AudioPreviewState>({ activeId: null, status: "idle", error: null });

  const clearTimer = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const stop = useCallback(() => {
    clearTimer();
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
    setState({ activeId: null, status: "idle", error: null });
  }, []);

  useEffect(() => () => stop(), [stop]);

  const toggle = useCallback(
    (id: string, url: string) => {
      if (state.activeId === id && state.status !== "error") {
        stop();
        return;
      }
      if (!audioRef.current) audioRef.current = new Audio();
      const a = audioRef.current;
      a.pause();
      clearTimer();
      a.onended = () => setState({ activeId: null, status: "idle", error: null });
      a.onplaying = () => {
        clearTimer();
        setState({ activeId: id, status: "playing", error: null });
      };
      a.onerror = () => {
        clearTimer();
        setState({ activeId: id, status: "error", error: "No se pudo reproducir la muestra de esta voz." });
      };
      a.src = url;
      setState({ activeId: id, status: "loading", error: null });
      timeoutRef.current = setTimeout(() => {
        a.pause();
        setState({ activeId: id, status: "error", error: "La muestra tarda demasiado en cargar. Inténtalo de nuevo." });
      }, LOAD_TIMEOUT_MS);
      const seq = ++seqRef.current;
      void a.play().catch((err: unknown) => {
        // Rechazo de una petición ya sustituida (o AbortError por cambiar de voz): no es un error.
        if (seq !== seqRef.current || (err instanceof DOMException && err.name === "AbortError")) return;
        clearTimer();
        const message = err instanceof Error && err.name === "NotAllowedError"
          ? "El navegador bloqueó el audio: vuelve a pulsar Escuchar."
          : "No se pudo reproducir la muestra de esta voz.";
        setState({ activeId: id, status: "error", error: message });
      });
    },
    [state.activeId, state.status, stop]
  );

  const statusFor = useCallback(
    (id: string): PreviewStatus => (state.activeId === id ? state.status : "idle"),
    [state.activeId, state.status]
  );

  return { ...state, toggle, stop, statusFor };
}
