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
 * ⚠️ NO VERIFICADO: importar llama a la API real de ElevenLabs. En este entorno
 * la ELEVENLABS_API_KEY es el marcador de ejemplo y devuelve 401, así que
 * mostrará el error del proveedor tal cual, sin disimularlo. Por eso el botón se
 * deshabilita cuando el registry dice que no hay credencial: es más honesto que
 * dejar al usuario chocar contra un 401 sin explicación.
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

interface Props {
  tts: TtsCredentialStatus;
  onChanged: () => void;
}

export function VoiceAddForms({ tts, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [cloned, setCloned] = useState(false);
  const [consent, setConsent] = useState(false);

  // Sin credencial de TTS el proveedor responde 401: se bloquea con motivo visible.
  const providerBlocked = !tts.ready && !tts.unknown;
  const providerBlockedReason = "Necesita una clave de ElevenLabs válida en Proveedores e IA.";

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/crm/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || `Error ${res.status}`);
      return json;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!name.trim() || !voiceId.trim()) {
      toast({ title: "Faltan el nombre y el identificador de la voz", variant: "destructive" });
      return;
    }
    if (cloned && !consent) {
      toast({
        title: "Falta el consentimiento",
        description: "Una voz clonada solo puede registrarse con el consentimiento de su propietario.",
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
      toast({ title: "Voz registrada", description: "Ya puedes asignársela a un agente." });
      onChanged();
    } catch (err) {
      toast({
        title: "No se pudo registrar la voz",
        description: err instanceof Error ? err.message : "Error desconocido",
        variant: "destructive",
      });
    }
  };

  const importFromProvider = async () => {
    try {
      const json = await post({ action: "import_elevenlabs" });
      const n = json.data?.imported ?? 0;
      toast({
        title: n > 0 ? `Importadas ${n} voces` : "ElevenLabs no devolvió ninguna voz",
        description: n > 0 ? "Elige una y márcala por defecto o asígnasela a un agente." : undefined,
      });
      onChanged();
    } catch (err) {
      toast({
        title: "ElevenLabs rechazó la petición",
        description: err instanceof Error ? err.message : "Error desconocido",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
          <Download className="h-4 w-4" aria-hidden="true" />
          Traer las voces que ya existen en ElevenLabs
        </h3>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          Copia a este catálogo las voces de tu cuenta de ElevenLabs (la biblioteca pública y las que hayas
          creado). Es la forma más rápida de tener de dónde elegir.
        </p>
        <Button variant="outline" onClick={importFromProvider} disabled={busy || providerBlocked} title={providerBlocked ? providerBlockedReason : undefined}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="mr-2 h-4 w-4" aria-hidden="true" />}
          Importar de ElevenLabs
        </Button>
        {providerBlocked && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            Desactivado: {providerBlockedReason}{" "}
            <Link href={PROVIDERS_SETTINGS_HREF} className="underline">
              Configurarla
            </Link>
          </p>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
          <Mic className="h-4 w-4" aria-hidden="true" />
          Registrar una voz por su identificador
        </h3>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          Si ya sabes el identificador de la voz en ElevenLabs, pégalo aquí y quedará disponible para los
          agentes sin importar todo el catálogo.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="v-name">Nombre</Label>
            <Input id="v-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Voz de Camilo" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="v-id">Identificador de voz (ElevenLabs)</Label>
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
              Es una voz clonada de una persona del equipo
            </Label>
          </div>
          {cloned && (
            <div className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2 dark:border-amber-900 dark:bg-amber-950">
              <Checkbox id="v-consent" checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
              <Label htmlFor="v-consent" className="cursor-pointer text-xs font-normal text-amber-900 dark:text-amber-100">
                Confirmo que la persona propietaria de la voz dio su consentimiento por escrito y que no es
                la voz de un tercero (Ley 1581 de 2012 y política de ElevenLabs).
              </Label>
            </div>
          )}
        </div>
        <div className="mt-3">
          <Button onClick={add} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Registrar voz
          </Button>
        </div>
      </div>
    </div>
  );
}
