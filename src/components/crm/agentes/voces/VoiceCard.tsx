"use client";

/**
 * Tarjeta de una voz de la biblioteca pública (brief UX 6.1): avatar
 * determinista, nombre, estilo · acento, etiquetas, «Escuchar» con onda animada
 * y «Añadir a mis voces» en un clic.
 *
 * Ronda 2: las voces solo de pago se anuncian ANTES del clic (deshabilitadas
 * con motivo cuando se sabe que la cuenta es gratuita); al añadir, el foco no
 * cae al `body` cuando el botón desaparece (R2).
 */

import React, { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, Lock, Plus } from "lucide-react";
import { splitCardTags, type LibraryVoice } from "@/lib/services/crm/voiceLibrary";
import { VoiceAvatar } from "./VoiceAvatar";
import { VoicePreviewButton } from "./VoicePreviewButton";
import type { PreviewStatus } from "./useAudioPreview";
import { useTranslations } from "next-intl";

interface Props {
  voice: LibraryVoice;
  previewStatus: PreviewStatus;
  onPreview: (voice: LibraryVoice) => void;
  added: boolean;
  adding: boolean;
  onAdd: (voice: LibraryVoice) => void;
  /** `true` cuando el servidor sabe que la cuenta de ElevenLabs es gratuita; `null` si no lo sabe. */
  accountIsFree: boolean | null;
}

export function VoiceCard({ voice, previewStatus, onPreview, added, adding, onAdd, accountIsFree }: Props) {
  const tx = useTranslations("crm.agentesIa");
  const playing = previewStatus === "playing";
  const { headline, tags } = splitCardTags(voice);
  const paid = !voice.free_users_allowed;
  const blocked = paid && accountIsFree === true;
  const previewRef = useRef<HTMLButtonElement | null>(null);
  const focusAfterAdd = useRef(false);
  const paidNoteId = `lib-${voice.voice_id}-paid`;

  // R2: al añadir, el botón se sustituye por un texto; el foco pasa a «Escuchar»
  // de la misma tarjeta o, si no se puede escuchar, al campo de búsqueda.
  useEffect(() => {
    if (!added || !focusAfterAdd.current) return;
    focusAfterAdd.current = false;
    const preview = previewRef.current;
    if (preview && !preview.disabled) preview.focus();
    else document.getElementById("lib-search")?.focus();
  }, [added]);

  return (
    <article
      className="group flex h-full flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-blue-500 dark:border-gray-700 dark:bg-gray-900"
      aria-labelledby={`lib-${voice.voice_id}-name`}
    >
      <div className="flex items-start gap-3">
        <VoiceAvatar voiceId={voice.voice_id} name={voice.name} playing={playing} />
        <div className="min-w-0 flex-1">
          <h3 id={`lib-${voice.voice_id}-name`} className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100" title={voice.name}>
            {voice.name}
          </h3>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
            {headline ?? ""}
            {voice.cloned_by_count > 0 ? `${headline ? " · " : ""}${tx("voiceCard.usadaPor", { n: voice.cloned_by_count })}` : ""}
          </p>
        </div>
      </div>

      {voice.description && (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-gray-600 dark:text-gray-300">{voice.description}</p>
      )}

      {(tags.length > 0 || paid) && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={tx("voiceCard.etiquetas")}>
          {paid && (
            <li>
              <Badge variant="warning" className="gap-1 font-normal">
                <Lock className="h-3 w-3" aria-hidden="true" />
                {tx("voiceCard.planPago")}
              </Badge>
            </li>
          )}
          {tags.map((t) => (
            <li key={t.key}>
              <Badge variant="secondary" className="font-normal">{t.label}</Badge>
            </li>
          ))}
        </ul>
      )}

      {paid && (
        <p id={paidNoteId} className="mt-2 text-xs text-amber-800 dark:text-amber-200">
          {blocked
            ? tx("voiceCard.noPuedeAnadirPlan")
            : tx("voiceCard.soloPuedeAnadirPlan")}
        </p>
      )}

      {/* UX móvil: dos columnas iguales; «Añadir» ya no se sale por la derecha a 375 px. */}
      <div className="mt-auto grid grid-cols-2 items-center gap-2 pt-4">
        <VoicePreviewButton
          ref={previewRef}
          voiceName={voice.name}
          status={previewStatus}
          onToggle={() => onPreview(voice)}
          disabled={!voice.preview_url}
        />

        {added ? (
          <span className="inline-flex items-center justify-end gap-1 text-xs font-medium text-green-700 dark:text-green-300" role="status">
            <Check className="h-4 w-4" aria-hidden="true" />
            {tx("voiceCard.misVoces")}
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            variant={paid ? "outline" : "default"}
            className={`min-w-0 gap-1.5 ${paid ? "" : "bg-blue-600 text-white hover:bg-blue-700"}`}
            onClick={() => {
              if (adding) return;
              focusAfterAdd.current = true;
              onAdd(voice);
            }}
            // Mientras añade no se deshabilita (perdería el foco si falla): se ignora el clic y se anuncia ocupado.
            aria-busy={adding || undefined}
            disabled={blocked}
            aria-label={tx("voiceCard.anadirMisVoces", { name: voice.name })}
            aria-describedby={paid ? paidNoteId : undefined}
          >
            {adding ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : paid ? <Lock className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />}
            <span className="truncate">{tx("voiceCard.anadir")}</span>
          </Button>
        )}
      </div>
    </article>
  );
}
