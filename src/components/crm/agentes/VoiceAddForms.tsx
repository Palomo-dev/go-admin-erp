"use client";

/**
 * Formularios para añadir al catálogo voces que YA existen en el proveedor
 * (FASE 06), extraídos de `VoicesPanel` para no pasar de ~200 líneas.
 *
 * Dos caminos: importar el catálogo entero de ElevenLabs, o registrar un
 * identificador de voz concreto. El tercer camino —clonar una voz a partir de
 * muestras de audio, que es el único que CREA una voz nueva— vive en
 * `VoicesPanel` junto al catálogo, para que se encuentre.
 *
 * D9: no se clona la voz de un tercero; una voz `cloned` exige consentimiento y
 * la base lo impone con el CHECK `voices_cloned_requires_consent`.
 *
 * Importar llama a la API real de ElevenLabs (`GET /v1/voices`, verificado en
 * vivo el 2026-09-14). El botón se deshabilita cuando el registry dice que no
 * hay credencial: es más honesto que dejar al usuario chocar contra un 401.
 * Desde el rediseño UX de 2026-09-14 estos dos formularios viven plegados bajo
 * «Más opciones» en la pestaña Mis voces.
 */

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/use-toast";
import { Loader2, Mic, Download } from "lucide-react";
import { PROVIDERS_SETTINGS_HREF, type TtsCredentialStatus } from "./useVoiceCatalog";
import { useTranslations } from "next-intl";

interface Props {
  tts: TtsCredentialStatus;
  onChanged: () => void;
}

export function VoiceAddForms({ tts, onChanged }: Props) {
  const t = useTranslations("crm.agentesIa");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [cloned, setCloned] = useState(false);
  const [consent, setConsent] = useState(false);

  // Sin credencial de TTS el proveedor responde 401: se bloquea con motivo visible.
  const providerBlocked = !tts.ready && !tts.unknown;
  const providerBlockedReason = t("voiceAddForms.necesitaClaveElevenlabs");

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/crm/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || t("agentCampaignsPanel.error", { status: res.status }));
      return json;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!name.trim() || !voiceId.trim()) {
      toast({ title: t("voiceAddForms.faltanNombreIdentificadorVoz"), variant: "destructive" });
      return;
    }
    if (cloned && !consent) {
      toast({
        title: t("voiceAddForms.faltaConsentimiento"),
        description: t("voiceAddForms.vozClonadaSoloPuede"),
        variant: "destructive",
      });
      return;
    }
    try {
      await post({
        name: name.trim(),
        provider_voice_id: voiceId.trim(),
        provider: "elevenlabs",
        kind: cloned ? "cloned" : "library",
        consent_recorded_at: cloned ? new Date().toISOString() : null,
        consent_evidence: cloned ? { declared_in_ui: true, at: new Date().toISOString() } : {},
      });
      setName("");
      setVoiceId("");
      setCloned(false);
      setConsent(false);
      toast({ title: t("voiceAddForms.vozRegistrada"), description: t("voiceAddForms.yaPuedesAsignarselaAgente") });
      onChanged();
    } catch (err) {
      toast({
        title: t("voiceAddForms.noPudoRegistrarVoz"),
        description: err instanceof Error ? err.message : t("voiceAddForms.errorDesconocido"),
        variant: "destructive",
      });
    }
  };

  const importFromProvider = async () => {
    try {
      const json = await post({ action: "import_elevenlabs" });
      const n = json.data?.imported ?? 0;
      toast({
        title: n > 0 ? t("voiceAddForms.importadasVoces", { n }) : t("voiceAddForms.elevenlabsNoDevolvioNinguna"),
        description: n > 0 ? t("voiceAddForms.eligeMarcalaDefectoAsignasela") : undefined,
      });
      onChanged();
    } catch (err) {
      toast({
        title: t("voiceAddForms.elevenlabsRechazoPeticion"),
        description: err instanceof Error ? err.message : t("voiceAddForms.errorDesconocido"),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
          <Download className="h-4 w-4" aria-hidden="true" />
          {t("voiceAddForms.traerVocesYaExisten")}
        </h3>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          {t("voiceAddForms.copiaEsteCatalogoVoces")}
        </p>
        <Button variant="outline" onClick={importFromProvider} disabled={busy || providerBlocked} title={providerBlocked ? providerBlockedReason : undefined}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="mr-2 h-4 w-4" aria-hidden="true" />}
          {t("voiceAddForms.importarElevenlabs")}
        </Button>
        {providerBlocked && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            {t("voiceAddForms.desactivado")} {providerBlockedReason}{" "}
            <Link href={PROVIDERS_SETTINGS_HREF} className="underline">
              {t("voiceAddForms.configurarla")}
            </Link>
          </p>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
          <Mic className="h-4 w-4" aria-hidden="true" />
          {t("voiceAddForms.registrarVozIdentificador")}
        </h3>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          {t("voiceAddForms.siYaSabesIdentificador")}
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="v-name">{t("voiceAddForms.nombre")}</Label>
            <Input id="v-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("voiceAddForms.vozCamilo")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="v-id">{t("voiceAddForms.identificadorVozElevenlabs")}</Label>
            <Input
              id="v-id"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              placeholder="6xftrpatV0jGmFHxDjUv"
            />
          </div>
        </div>
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox id="v-cloned" checked={cloned} onCheckedChange={(v) => setCloned(v === true)} />
            <Label htmlFor="v-cloned" className="cursor-pointer text-sm font-normal">
              {t("voiceAddForms.vozClonadaPersonaEquipo")}
            </Label>
          </div>
          {cloned && (
            <div className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2 dark:border-amber-900 dark:bg-amber-950">
              <Checkbox id="v-consent" checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
              <Label htmlFor="v-consent" className="cursor-pointer text-xs font-normal text-amber-900 dark:text-amber-100">
                {t("voiceAddForms.confirmoPersonaPropietariaVoz")}
              </Label>
            </div>
          )}
        </div>
        <div className="mt-3">
          <Button onClick={add} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {t("voiceAddForms.registrarVoz")}
          </Button>
        </div>
      </div>
    </div>
  );
}
