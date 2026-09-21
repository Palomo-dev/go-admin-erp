"use client";

/**
 * Tarjeta seleccionable de una voz (pestaña «Voz» del editor de agente, UXM-D).
 *
 * Un `<input type="radio">` real (oculto, pero enfocable) más una `<label>` que
 * cubre avatar, nombre y etiquetas: el lector anuncia «Valentina, botón de
 * opción, seleccionada» y las flechas cambian de voz. «Escuchar» es un botón
 * hermano, fuera de la etiqueta, para no anidar controles.
 */

import React from "react";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Star } from "lucide-react";
import { VOICE_KIND_LABELS, catalogVoiceTags, type VoiceCatalogRow } from "../useVoiceCatalog";
import { VoiceAvatar } from "./VoiceAvatar";
import { VoicePreviewButton } from "./VoicePreviewButton";
import type { PreviewStatus } from "./useAudioPreview";

interface Props {
  groupName: string;
  /** Valor del radio; `null` representa «voz por defecto de la organización». */
  value: string;
  checked: boolean;
  onSelect: () => void;
  voice: VoiceCatalogRow | null;
  /** Título cuando no hay fila (opción «por defecto»). */
  title?: string;
  subtitle?: string;
  previewStatus: PreviewStatus;
  onPreview?: () => void;
}

const CARD =
  "relative flex flex-col gap-3 rounded-xl border bg-white p-3 shadow-sm transition-colors " +
  "has-[:checked]:border-blue-600 has-[:checked]:ring-1 has-[:checked]:ring-blue-600 " +
  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 has-[:focus-visible]:ring-offset-2 " +
  "dark:bg-gray-900 dark:has-[:focus-visible]:ring-offset-gray-900";

export function VoicePickCard({
  groupName,
  value,
  checked,
  onSelect,
  voice,
  title,
  subtitle,
  previewStatus,
  onPreview,
}: Props) {
  const id = `${groupName}-${value}`;
  const name = voice?.name ?? title ?? "";
  const tags = voice ? catalogVoiceTags(voice) : [];
  const canPreview = Boolean(voice && onPreview && voice.provider === "elevenlabs");

  return (
    <div className={`${CARD} ${checked ? "" : "border-gray-200 dark:border-gray-700"}`}>
      <input
        type="radio"
        id={id}
        name={groupName}
        value={value}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
        {voice ? (
          <VoiceAvatar
            voiceId={voice.provider_voice_id}
            name={voice.name}
            size="sm"
            playing={previewStatus === "playing"}
          />
        ) : (
          <span
            aria-hidden="true"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300"
          >
            <Star className="h-4 w-4" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span
            className="line-clamp-2 break-words text-sm font-semibold text-gray-900 dark:text-gray-100"
            title={name}
          >
            {name}
          </span>
          {subtitle && (
            <span className="block break-words text-xs text-gray-500 dark:text-gray-400">{subtitle}</span>
          )}
          {voice && (
            <span className="mt-1 flex flex-wrap items-center gap-1">
              <Badge
                variant={voice.kind === "cloned" ? "info" : "secondary"}
                className="font-normal"
              >
                {VOICE_KIND_LABELS[voice.kind] ?? voice.kind}
              </Badge>
              {voice.is_default && (
                <Badge variant="success" className="gap-1 font-normal">
                  <Star className="h-3 w-3" aria-hidden="true" />
                  Por defecto
                </Badge>
              )}
              {tags.map((t) => (
                <Badge key={t.key} variant="outline" className="font-normal">
                  {t.label}
                </Badge>
              ))}
            </span>
          )}
          {voice?.consent_recorded_at && (
            <span className="mt-1 inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-300">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              Consentimiento registrado
            </span>
          )}
        </span>
        <span
          aria-hidden="true"
          className={`mt-1 h-4 w-4 shrink-0 rounded-full border-2 ${
            checked
              ? "border-blue-600 bg-blue-600 ring-2 ring-inset ring-white dark:ring-gray-900"
              : "border-gray-400"
          }`}
        />
      </label>
      {voice && (
        <div className="flex items-center justify-end">
          <VoicePreviewButton
            voiceName={voice.name}
            status={previewStatus}
            onToggle={() => onPreview?.()}
            disabled={!canPreview}
          />
        </div>
      )}
    </div>
  );
}
