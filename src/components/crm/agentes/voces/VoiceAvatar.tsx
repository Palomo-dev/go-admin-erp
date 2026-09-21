"use client";

/**
 * Avatar de una voz: orbe con gradiente determinista a partir del `voice_id`
 * (brief UX 6.1). Cuando la voz está sonando, late un anillo alrededor.
 */

import React from "react";
import { Mic } from "lucide-react";
import { voiceAvatar } from "@/lib/services/crm/voiceAvatar";
import { PulseRing } from "@/components/shared/motion";

const SIZES = { sm: "h-9 w-9", md: "h-12 w-12", lg: "h-16 w-16" } as const;

interface Props {
  voiceId: string;
  name: string;
  size?: keyof typeof SIZES;
  playing?: boolean;
  className?: string;
}

export function VoiceAvatar({ voiceId, name, size = "md", playing = false, className = "" }: Props) {
  const { gradient, veil, ink } = voiceAvatar(voiceId);
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  // La tinta de la inicial se elige por el contraste mínimo en TODA la caja del
  // glifo, con un velo sutil debajo (ronda 4: solo con el centro, 3 de 24 orbes
  // bajaban a 4,03 en los bordes de la letra). Negra, no gris: la garantía de
  // 4,5:1 de `inkForHues` se calcula contra negro puro.
  const inkClass = ink === "dark" ? "text-black" : "text-white";
  return (
    <span className={`relative inline-flex shrink-0 ${SIZES[size]} ${className}`}>
      <span
        role="img"
        aria-label={`Avatar de la voz ${name}`}
        className={`flex h-full w-full items-center justify-center rounded-full shadow-inner ring-1 ring-black/5 dark:ring-white/10 ${inkClass}`}
        style={{ background: `${veil}, ${gradient}` }}
      >
        <span className="text-sm font-semibold" aria-hidden="true">
          {initial}
        </span>
        {playing && (
          <Mic className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-blue-600 p-0.5 text-white" aria-hidden="true" />
        )}
      </span>
      <PulseRing active={playing} />
    </span>
  );
}
