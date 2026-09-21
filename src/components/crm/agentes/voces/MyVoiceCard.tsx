"use client";

/**
 * Tarjeta de una voz de «Mis voces» (brief UX 6.1): avatar, origen, etiquetas,
 * «Escuchar», predeterminada en un clic, asignar a un agente y borrar.
 */

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "@/components/ui/use-toast";
import { ChevronDown, Copy, ShieldCheck, Star, Trash2 } from "lucide-react";
import { VOICE_KIND_LABELS, catalogVoiceTags, type VoiceCatalogRow } from "../useVoiceCatalog";
import { VoiceAvatar } from "./VoiceAvatar";
import { VoicePreviewButton } from "./VoicePreviewButton";
import type { PreviewStatus } from "./useAudioPreview";

export interface AgentLite {
  id: string;
  name: string;
  voice_ref_id: string | null;
}

interface Props {
  voice: VoiceCatalogRow;
  agents: AgentLite[];
  previewStatus: PreviewStatus;
  onPreview: (voice: VoiceCatalogRow) => void;
  onMakeDefault: (voice: VoiceCatalogRow) => void;
  onAssign: (voice: VoiceCatalogRow, agentId: string) => void;
  assigning: boolean;
  onDelete: (voice: VoiceCatalogRow) => void;
}

/** `id` del `<article>`: el panel lo enfoca tras borrar la tarjeta vecina (R3). */
export const myVoiceCardId = (voiceId: string) => `my-voice-${voiceId}`;

async function copyText(label: string, value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast({ title: `${label} copiado`, description: value });
  } catch {
    toast({ title: `No se pudo copiar el ${label.toLowerCase()}`, description: value, variant: "destructive" });
  }
}

export function MyVoiceCard({ voice, agents, previewStatus, onPreview, onMakeDefault, onAssign, assigning, onDelete }: Props) {
  const playing = previewStatus === "playing";
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Ronda 3: «Por defecto» desaparece al predeterminar y el foco caía al body. Se
  // recuerda que el clic salió de aquí y, cuando la fila vuelve ya predeterminada,
  // el foco pasa a «Escuchar» de la misma tarjeta (efecto tras el commit, sin rAF).
  const previewRef = useRef<HTMLButtonElement | null>(null);
  const focusAfterDefault = useRef(false);
  useEffect(() => {
    if (voice.is_default && focusAfterDefault.current) {
      focusAfterDefault.current = false;
      previewRef.current?.focus();
    }
  }, [voice.is_default]);
  const users = agents.filter((a) => a.voice_ref_id === voice.id);
  const tags = catalogVoiceTags(voice);
  const kindLabel = VOICE_KIND_LABELS[voice.kind] ?? voice.kind;

  return (
    <article
      id={myVoiceCardId(voice.id)}
      tabIndex={-1}
      className={`flex h-full flex-col rounded-xl border bg-white p-4 shadow-sm outline-none transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-gray-900 ${
        voice.is_default ? "border-blue-300 dark:border-blue-700" : "border-gray-200 dark:border-gray-700"
      }`}
      aria-labelledby={`my-${voice.id}-name`}
    >
      <div className="flex items-start gap-3">
        <VoiceAvatar voiceId={voice.provider_voice_id} name={voice.name} playing={playing} />
        <div className="min-w-0 flex-1">
          <h3 id={`my-${voice.id}-name`} className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100" title={voice.name}>
            {voice.name}
          </h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            <Badge variant={voice.kind === "cloned" ? "info" : "secondary"} className="font-normal">{kindLabel}</Badge>
            {voice.is_default && (
              <Badge variant="success" className="gap-1 font-normal">
                <Star className="h-3 w-3" aria-hidden="true" />
                Por defecto
              </Badge>
            )}
            {!voice.is_active && <Badge variant="outline" className="font-normal">Inactiva</Badge>}
          </div>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
          aria-label={`Borrar la voz ${voice.name}`}
          onClick={() => onDelete(voice)}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Etiquetas">
          {tags.map((t) => (
            <li key={t.key}><Badge variant="secondary" className="font-normal">{t.label}</Badge></li>
          ))}
        </ul>
      )}

      <p className="mt-3 break-words text-xs text-gray-500 dark:text-gray-400">
        {users.length > 0
          ? `La usan: ${users.map((a) => a.name).join(", ")}`
          : voice.is_default
            ? "La usan todos los agentes sin voz propia."
            : "Todavía no la usa ningún agente."}
        {voice.consent_recorded_at && (
          <span className="ml-1 inline-flex items-center gap-0.5 text-green-700 dark:text-green-300">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            consentimiento registrado
          </span>
        )}
      </p>

      {/* R8: lo técnico (identificador, modelo, descripción) sigue ahí, plegado, y se copia con un clic. */}
      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen} className="mt-2">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded text-xs text-gray-500 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${detailsOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            Detalles técnicos
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <dl className="mt-1.5 space-y-1 rounded-lg bg-gray-50 px-2.5 py-2 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-200">
            <div className="flex items-center gap-1.5">
              <dt className="shrink-0 text-gray-500 dark:text-gray-400">Identificador</dt>
              <dd className="min-w-0 flex-1 truncate font-mono" title={voice.provider_voice_id}>{voice.provider_voice_id}</dd>
              <Button type="button" size="icon" variant="ghost" className="h-6 w-6 shrink-0" aria-label={`Copiar el identificador de ${voice.name}`} onClick={() => void copyText("Identificador", voice.provider_voice_id)}>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
            <div className="flex gap-1.5">
              <dt className="shrink-0 text-gray-500 dark:text-gray-400">Modelo</dt>
              <dd className="font-mono">{voice.model_id || "—"}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="shrink-0 text-gray-500 dark:text-gray-400">Proveedor</dt>
              <dd>{voice.provider} · {voice.language}</dd>
            </div>
            {voice.description && (
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-gray-500 dark:text-gray-400">Descripción</dt>
                <dd className="min-w-0">{voice.description}</dd>
              </div>
            )}
          </dl>
        </CollapsibleContent>
      </Collapsible>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        <VoicePreviewButton
          ref={previewRef}
          voiceName={voice.name}
          status={previewStatus}
          onToggle={() => onPreview(voice)}
          disabled={voice.provider !== "elevenlabs"}
        />

        {!voice.is_default && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="gap-1"
            onClick={() => {
              focusAfterDefault.current = true;
              onMakeDefault(voice);
            }}
            aria-label={`Usar ${voice.name} por defecto`}
          >
            <Star className="h-4 w-4" aria-hidden="true" />
            Por defecto
          </Button>
        )}

        {agents.length > 0 && (
          <Select value="" disabled={assigning} onValueChange={(agentId) => onAssign(voice, agentId)}>
            <SelectTrigger className="h-8 w-full text-xs sm:ml-auto sm:w-[170px]" aria-label={`Asignar la voz ${voice.name} a un agente`}>
              <SelectValue placeholder="Asignar a un agente…" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}{a.voice_ref_id === voice.id ? " · ya la usa" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </article>
  );
}
