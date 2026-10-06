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
import { useTranslations } from "next-intl";

interface Props {
  form: AgentFormState;
  patch: (partial: Partial<AgentFormState>) => void;
  catalog: VoiceCatalogState;
  /** Cierra el editor y abre la pestaña «Voces» de la página. */
  onGoToVoices?: () => void;
}

const GROUP = "ag-voice";
const INHERIT = "__inherit__";

function effectiveSummary(form: AgentFormState, catalog: VoiceCatalogState, t: (clave: string, valores?: Record<string, string>) => string): string {
  const r = resolveEffectiveVoice(form, catalog.voices);
  switch (r.source) {
    case "agent":
      return t("agentVoiceTab.resumen.agente", { voz: r.voice.name });
    case "default":
      return t("agentVoiceTab.resumen.defecto", { voz: r.voice.name });
    case "loose":
      return t("agentVoiceTab.resumen.suelto", { id: r.voiceId });
    default:
      return t("agentVoiceTab.resumen.ninguna");
  }
}

export function AgentVoiceTab({ form, patch, catalog, onGoToVoices }: Props) {
  const t = useTranslations("crm.agentesIa");
  const { voices, defaultVoice, loading, error, tts, reload } = catalog;
  const player = useAudioPreview();
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(form.voice_id));

  useEffect(() => {
    if (player.status === "error" && player.error) {
      toast({ title: t("agentVoiceTab.noPudoReproducir"), description: player.error, variant: "destructive" });
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
        <span className="min-w-0 break-words">{effectiveSummary(form, catalog, t)}</span>
      </p>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {t("agentVoiceTab.vozEsteAgente")}
        </legend>
        {loading ? (
          <div className="space-y-2" aria-busy="true" aria-label={t("agentVoiceTab.cargandoCatalogoVoces")}>
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div
            role="alert"
            className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            <span className="min-w-0 flex-1">{t("agentVoiceTab.noPudoCargarCatalogo", { error })}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void reload()}>
              {t("conocimiento.error.reintentar")}
            </Button>
          </div>
        ) : (
          <div
            role="radiogroup"
            aria-label={t("agentVoiceTab.vozEsteAgente")}
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          >
            <VoicePickCard
              groupName={GROUP}
              value={INHERIT}
              checked={form.voice_ref_id === null}
              onSelect={() => select(null)}
              voice={null}
              title={t("agentVoiceTab.vozDefectoOrganizacion")}
              subtitle={
                defaultVoice
                  ? t("agentVoiceTab.ahora", { name: defaultVoice.name })
                  : t("agentVoiceTab.ningunaMarcadaVozEstandar")
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
                subtitle={v.is_active ? undefined : t("agentVoiceTab.inactivaAgenteNoUsara")}
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
              {t("agentVoiceTab.todaviaNoHayVoces")}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {tts.ready
                ? t("agentVoiceTab.anadeBibliotecaClonaTuya")
                : t("agentVoiceTab.faltaClaveVozSintetica")}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {onGoToVoices && (
                <Button
                  type="button"
                  size="sm"
                  className="bg-blue-600 text-white hover:bg-blue-700"
                  onClick={onGoToVoices}
                >
                  {t("agentVoiceTab.anadeVozCatalogo")}
                </Button>
              )}
              {!tts.ready && (
                <Button asChild type="button" size="sm" variant="outline">
                  <Link href={PROVIDERS_SETTINGS_HREF}>{t("agentVoiceTab.guardarClaveVoz")}</Link>
                </Button>
              )}
            </div>
          </div>
        )}
        {catalog.refreshing && (
          <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> {t("agentVoiceTab.actualizando")}
          </p>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t("agentVoiceTab.vozClonadaExigeConsentimiento")}
        </p>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ag-lang">{t("agentVoiceTab.idioma")}</Label>
          <Input
            id="ag-lang"
            value={form.language}
            onChange={(e) => patch({ language: e.target.value })}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("agentVoiceTab.codigoPEjCo")}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ag-stt">{t("agentVoiceTab.transcripcion")}</Label>
          <Select value={form.stt_provider} onValueChange={(v) => patch({ stt_provider: v })}>
            <SelectTrigger id="ag-stt">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="deepgram">Deepgram nova-3</SelectItem>
              <SelectItem value="twilio">{t("agentVoiceTab.defectoTwilio")}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t("agentVoiceTab.quienConvierteVozTexto")}
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
            {t("agentVoiceTab.avanzadoIdentificadorVozSuelto")}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-1.5 pt-2">
          <Label htmlFor="ag-voiceid">{t("agentVoiceTab.identificadorVozSueltoOpcional")}</Label>
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
            {t("agentVoiceTab.salidaEmergenciaSoloEntra")}
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
