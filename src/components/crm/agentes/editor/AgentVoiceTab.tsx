"use client";

/**
 * Pestaña «Voz» del editor de agente (UXM-D): las voces de la organización como
 * tarjetas seleccionables con avatar, etiquetas y «Escuchar»; la voz por defecto
 * marcada; estado vacío que lleva a la pestaña «Voces»; el identificador suelto
 * escondido tras «Avanzado».
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { AlertTriangle, ChevronDown, Info, Loader2, Mic } from "lucide-react";
import { PROVIDERS_SETTINGS_HREF, type VoiceCatalogState } from "../useVoiceCatalog";
import { useAudioPreview } from "../voces/useAudioPreview";
import { VoicePickCard } from "../voces/VoicePickCard";
import { resolveEffectiveVoice, type AgentFormState } from "./useAgentForm";

interface Props {
  form: AgentFormState;
  patch: (partial: Partial<AgentFormState>) => void;
  catalog: VoiceCatalogState;
  /** Cierra el editor y abre la pestaña «Voces» de la página. */
  onGoToVoices?: () => void;
}

const GROUP = "ag-voice";
const INHERIT = "__inherit__";

function effectiveSummary(form: AgentFormState, catalog: VoiceCatalogState): string {
  const r = resolveEffectiveVoice(form, catalog.voices);
  switch (r.source) {
    case "agent":
      return `Este agente hablará con «${r.voice.name}».`;
    case "default":
      return `Sin voz propia: hablará con la voz por defecto de la organización, «${r.voice.name}».`;
    case "loose":
      return `Hablará con el identificador suelto ${r.voiceId} (no está en el catálogo).`;
    default:
      return "No hay ninguna voz elegida ni por defecto: hablará con la voz estándar de Google.";
  }
}

export function AgentVoiceTab({ form, patch, catalog, onGoToVoices }: Props) {
  const { voices, defaultVoice, loading, error, tts, reload } = catalog;
  const player = useAudioPreview();
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(form.voice_id));

  useEffect(() => {
    if (player.status === "error" && player.error) {
      toast({ title: "No se pudo reproducir", description: player.error, variant: "destructive" });
    }
  }, [player.status, player.error]);

  const select = (id: string | null) => patch({ voice_ref_id: id });

  return (
    <div className="space-y-4">
      <p
        role="status"
        className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100"
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {/* Tester UXM-D: un nombre de voz sin espacios (o un id suelto largo) medía 617 px a 375 px. */}
        <span className="min-w-0 break-words">{effectiveSummary(form, catalog)}</span>
      </p>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Voz de este agente
        </legend>
        {loading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Cargando el catálogo de voces">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div
            role="alert"
            className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            <span className="min-w-0 flex-1">No se pudo cargar el catálogo de voces: {error}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void reload()}>
              Reintentar
            </Button>
          </div>
        ) : (
          <div
            role="radiogroup"
            aria-label="Voz de este agente"
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          >
            <VoicePickCard
              groupName={GROUP}
              value={INHERIT}
              checked={form.voice_ref_id === null}
              onSelect={() => select(null)}
              voice={null}
              title="Voz por defecto de la organización"
              subtitle={
                defaultVoice
                  ? `Ahora es «${defaultVoice.name}»`
                  : "Ninguna marcada: voz estándar de Google"
              }
              previewStatus="idle"
            />
            {voices.map((v) => (
              <VoicePickCard
                key={v.id}
                groupName={GROUP}
                value={v.id}
                checked={form.voice_ref_id === v.id}
                onSelect={() => select(v.id)}
                voice={v}
                subtitle={v.is_active ? undefined : "Inactiva: el agente no la usará"}
                previewStatus={player.statusFor(v.id)}
                onPreview={() =>
                  player.toggle(v.id, v.preview_url || `/api/crm/voices/${v.id}/preview`)
                }
              />
            ))}
          </div>
        )}

        {!loading && !error && voices.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 p-5 text-center dark:border-gray-700">
            <Mic className="mx-auto h-7 w-7 text-blue-500" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-gray-800 dark:text-gray-200">
              Todavía no hay voces en el catálogo.
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {tts.ready
                ? "Añade una de la biblioteca o clona la tuya. Mientras tanto, este agente llamará con la voz estándar de Google."
                : "Falta la clave de voz sintética (TTS): sin ella no se puede añadir ni clonar ninguna voz."}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {onGoToVoices && (
                <Button
                  type="button"
                  size="sm"
                  className="bg-blue-600 text-white hover:bg-blue-700"
                  onClick={onGoToVoices}
                >
                  Añade una voz del catálogo
                </Button>
              )}
              {!tts.ready && (
                <Button asChild type="button" size="sm" variant="outline">
                  <Link href={PROVIDERS_SETTINGS_HREF}>Guardar la clave de voz</Link>
                </Button>
              )}
            </div>
          </div>
        )}
        {catalog.refreshing && (
          <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Actualizando…
          </p>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Una voz clonada exige consentimiento registrado de su propietario (Ley 1581 de 2012).
        </p>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ag-lang">Idioma</Label>
          <Input
            id="ag-lang"
            value={form.language}
            onChange={(e) => patch({ language: e.target.value })}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">Código, p. ej. es-CO</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ag-stt">Transcripción</Label>
          <Select value={form.stt_provider} onValueChange={(v) => patch({ stt_provider: v })}>
            <SelectTrigger id="ag-stt">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="deepgram">Deepgram nova-3</SelectItem>
              <SelectItem value="twilio">Por defecto de Twilio</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Quién convierte la voz en texto
          </p>
        </div>
      </div>

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded text-xs text-gray-600 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-300 dark:hover:text-gray-100"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${advancedOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
            Avanzado: identificador de voz suelto
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-1.5 pt-2">
          <Label htmlFor="ag-voiceid">Identificador de voz suelto (opcional)</Label>
          <Input
            id="ag-voiceid"
            value={form.voice_id}
            onChange={(e) => patch({ voice_id: e.target.value })}
            placeholder="Ej. 6xftrpatV0jGmFHxDjUv"
            aria-describedby="ag-voiceid-help"
          />
          <p
            id="ag-voiceid-help"
            className="flex items-start gap-1 text-xs text-gray-500 dark:text-gray-400"
          >
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            Salida de emergencia: solo entra en juego cuando la selección de arriba no resuelve a
            ninguna voz activa.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
