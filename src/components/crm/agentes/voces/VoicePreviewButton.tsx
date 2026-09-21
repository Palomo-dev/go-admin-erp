"use client";

/**
 * Botón «Escuchar / Detener» de una voz, compartido por la biblioteca, «Mis
 * voces» y el selector de voz del editor de agente (regla dura 7: una sola
 * implementación del estado cargando/sonando con onda animada).
 */

import React, { forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Play, Square } from "lucide-react";
import { SoundWave } from "@/components/shared/motion/audio";
import type { PreviewStatus } from "./useAudioPreview";

interface Props {
  voiceName: string;
  status: PreviewStatus;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
}

export const VoicePreviewButton = forwardRef<HTMLButtonElement, Props>(function VoicePreviewButton(
  { voiceName, status, onToggle, disabled = false, className = "" },
  ref,
) {
  const playing = status === "playing";
  const loading = status === "loading";
  return (
    <Button
      ref={ref}
      type="button"
      size="sm"
      variant={playing ? "secondary" : "outline"}
      onClick={onToggle}
      disabled={disabled || loading}
      aria-pressed={playing}
      aria-label={
        playing ? `Detener la muestra de ${voiceName}` : `Escuchar una muestra de ${voiceName}`
      }
      className={`min-w-0 gap-1.5 ${className}`}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
      ) : playing ? (
        <Square className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <Play className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span className="truncate">{playing ? "Detener" : "Escuchar"}</span>
      {playing && <SoundWave active className="text-blue-600 dark:text-blue-400" />}
    </Button>
  );
});
