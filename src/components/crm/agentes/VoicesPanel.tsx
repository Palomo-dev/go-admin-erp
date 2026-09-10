"use client";

/**
 * Pestaña «Voces» de /app/crm/agentes-ia (FASE 06).
 *
 * Responde a las dos preguntas del dueño del producto: dónde se ven las voces
 * disponibles y cómo se elige una para un agente. Por eso la pantalla:
 *  1. explica en una frase el orden real que aplica `agentRuntime.resolveVoice`
 *     (voz del agente → voz por defecto de la organización → voz estándar);
 *  2. dice si hay credencial de TTS y enlaza a donde se configura;
 *  3. lista el catálogo diciendo qué agentes usan cada voz y permitiendo
 *     asignarla a uno sin salir de aquí;
 *  4. deja clonar la voz propia (subida de muestras + consentimiento) sin salir
 *     de la pantalla de voces: es la única forma de CREAR una voz nueva desde
 *     la plataforma, y vive aquí a propósito para que se encuentre;
 *  5. nunca deja una lista vacía sin explicación ni se traga un error.
 *
 * Los otros dos caminos para añadir voces (importar el catálogo de ElevenLabs y
 * registrar un `voice_id` que ya existe) viven en `VoiceAddForms`.
 *
 * D9: no se clona la voz de un tercero. Sin la casilla de consentimiento no se
 * llama al proveedor, y la base lo impone además con el CHECK
 * `voices_cloned_requires_consent`.
 *
 * ⚠️ NO VERIFICADO: que la voz elegida suene depende de una ELEVENLABS_API_KEY
 * real. En este entorno la clave es el marcador de ejemplo y ElevenLabs devuelve
 * 401: importar, clonar y la reproducción en llamada no se han podido ejecutar
 * contra el proveedor. La pantalla lo dice en vez de fingir que está listo.
 */

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { AlertTriangle, Info, Loader2, Mic, RefreshCw, Star, Upload } from "lucide-react";
import {
  PROVIDERS_SETTINGS_HREF,
  VOICE_KIND_LABELS,
  useVoiceCatalog,
  type VoiceCatalogRow,
} from "./useVoiceCatalog";
import { VoiceAddForms } from "./VoiceAddForms";

interface AgentLite {
  id: string;
  name: string;
  voice_ref_id: string | null;
  is_active: boolean;
}

export function VoicesPanel() {
  const { voices, defaultVoice, loading, error, tts, reload } = useVoiceCatalog();
  const [agents, setAgents] = useState<AgentLite[]>([]);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);

  // Clonar mi voz: nombre, muestras de audio y consentimiento explícito.
  const [cloneName, setCloneName] = useState("");
  const [cloneFiles, setCloneFiles] = useState<File[]>([]);
  const [cloneConsent, setCloneConsent] = useState(false);
  const [cloning, setCloning] = useState(false);

  // Sin credencial de TTS el proveedor responde 401: se bloquea con motivo visible
  // en vez de dejar al usuario chocar contra el error del proveedor.
  const providerBlocked = !tts.ready && !tts.unknown;
  const providerBlockedReason = "Necesita una clave de ElevenLabs válida en Proveedores e IA.";

  const loadAgents = useCallback(async () => {
    setAgentsError(null);
    try {
      const res = await fetch("/api/crm/voice-agents", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || `Error ${res.status}`);
      setAgents((json.data ?? []) as AgentLite[]);
    } catch (err) {
      setAgents([]);
      setAgentsError(err instanceof Error ? err.message : "Error desconocido");
    }
  }, []);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const makeDefault = async (id: string) => {
    try {
      const res = await fetch("/api/crm/voices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_default: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || `Error ${res.status}`);
      toast({ title: "Voz por defecto actualizada", description: "La usarán los agentes que no tengan una voz propia." });
      void reload();
    } catch (err) {
      toast({
        title: "No se pudo marcar por defecto",
        description: err instanceof Error ? err.message : "Error desconocido",
        variant: "destructive",
      });
    }
  };

  const assignToAgent = async (voice: VoiceCatalogRow, agentId: string) => {
    setAssigning(voice.id);
    try {
      const res = await fetch(`/api/crm/voice-agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice_ref_id: voice.id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || `Error ${res.status}`);
      const agentName = agents.find((a) => a.id === agentId)?.name ?? "el agente";
      toast({ title: `«${voice.name}» asignada a ${agentName}` });
      await loadAgents();
    } catch (err) {
      toast({
        title: "No se pudo asignar la voz",
        description: err instanceof Error ? err.message : "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setAssigning(null);
    }
  };

  /**
   * Clona la voz propia en ElevenLabs y la deja en el catálogo de la
   * organización. Llama a `POST /api/crm/voices/clone` con `multipart/form-data`.
   *
   * ⚠️ NO VERIFICADO: con la clave marcador de este entorno el proveedor
   * responde 401 y ese error se muestra tal cual, sin disimularlo.
   */
  const cloneVoice = async () => {
    if (!cloneName.trim()) {
      toast({ title: "Ponle un nombre a la voz", variant: "destructive" });
      return;
    }
    if (cloneFiles.length === 0) {
      toast({ title: "Sube al menos una muestra de audio", variant: "destructive" });
      return;
    }
    if (!cloneConsent) {
      toast({
        title: "Falta el consentimiento",
        description:
          "Solo se puede clonar la voz propia o la de alguien del equipo que haya dado su consentimiento por escrito.",
        variant: "destructive",
      });
      return;
    }
    setCloning(true);
    try {
      const body = new FormData();
      body.append("name", cloneName.trim());
      body.append("consent", "true");
      for (const f of cloneFiles) body.append("samples", f);

      const res = await fetch("/api/crm/voices/clone", { method: "POST", body });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || `Error ${res.status}`);
      setCloneName("");
      setCloneFiles([]);
      setCloneConsent(false);
      toast({
        title: "Voz clonada",
        description: json.data?.requires_verification
          ? "ElevenLabs pide verificar la voz antes de usarla."
          : "Ya puedes marcarla por defecto o asignársela a un agente aquí arriba.",
      });
      void reload();
    } catch (err) {
      toast({
        title: "No se pudo clonar la voz",
        description: err instanceof Error ? err.message : "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setCloning(false);
    }
  };

  const agentsUsing = (voiceId: string) => agents.filter((a) => a.voice_ref_id === voiceId);

  return (
    <div className="space-y-5">
      {/* Cómo se elige la voz: el orden real del runtime, en una frase */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-medium">Cómo se decide con qué voz habla un agente</p>
          <ol className="list-decimal space-y-0.5 pl-4 text-xs">
            <li>La voz que tenga asignada ese agente (pestaña «Voz» de su editor, o el botón «Asignar» de esta lista).</li>
            <li>Si no tiene ninguna, la voz marcada aquí como <strong>Por defecto</strong>.</li>
            <li>
              Si tampoco hay una por defecto, la llamada sale con la voz estándar de Google que trae Twilio:
              funciona, pero suena genérica.
            </li>
          </ol>
          <p className="text-xs">
            Voz por defecto ahora mismo:{" "}
            <strong>{defaultVoice ? defaultVoice.name : "ninguna (se usará la voz estándar)"}</strong>
          </p>
        </div>
      </div>

      {/* Estado de la credencial del proveedor de voz */}
      {!tts.unknown && !tts.ready && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">No hay ninguna clave de voz sintética (TTS) utilizable.</p>
            <p className="text-xs">
              Sin ella no se puede importar el catálogo de ElevenLabs, ni clonar una voz, ni reproducir una
              voz de ElevenLabs en la llamada. Guarda la clave en{" "}
              <Link href={PROVIDERS_SETTINGS_HREF} className="underline">
                Configuración › CRM › Proveedores e IA
              </Link>
              , tarjeta «Voz sintética (TTS) · ElevenLabs». Las voces que registres mientras tanto quedan
              guardadas, pero no sonarán hasta que exista la clave.
            </p>
          </div>
        </div>
      )}
      {tts.unknown && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-gray-300 bg-gray-50 p-3 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            No se pudo comprobar si hay clave de voz sintética configurada (falló la lectura de Proveedores e
            IA). Importar o clonar pueden fallar con el error del proveedor.
          </span>
        </div>
      )}

      {/* Catálogo */}
      <section aria-labelledby="voces-catalogo" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="voces-catalogo" className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
            <Mic className="h-4 w-4" aria-hidden="true" />
            Voces disponibles {voices.length > 0 && <Badge variant="secondary">{voices.length}</Badge>}
          </h2>
          <Button size="sm" variant="ghost" onClick={() => void reload()} disabled={loading} aria-label="Recargar voces">
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
          </Button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Cargando voces…
          </div>
        )}

        {!loading && error && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            <span>No se pudo cargar el catálogo de voces: {error}</span>
            <Button size="sm" variant="outline" onClick={() => void reload()}>
              Reintentar
            </Button>
          </div>
        )}

        {!loading && !error && voices.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-sm dark:border-gray-700">
            <p className="font-medium text-gray-800 dark:text-gray-200">
              El catálogo está vacío: esta organización todavía no tiene ninguna voz registrada.
            </p>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              {tts.ready
                ? "Usa «Importar de ElevenLabs» aquí abajo para traer las voces de tu cuenta, o registra una por su identificador."
                : "Está vacío porque nunca se ha importado nada, y ahora mismo tampoco se puede importar: falta la clave de ElevenLabs. Configúrala primero y luego vuelve a esta pestaña."}
            </p>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              Mientras el catálogo esté vacío, los agentes llamarán con la voz estándar de Google.
            </p>
          </div>
        )}

        {!loading && !error && voices.length > 0 && (
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
            {voices.map((v) => {
              const users = agentsUsing(v.id);
              return (
                <li key={v.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {v.name}{" "}
                      {v.is_default && (
                        <Badge variant="success" className="ml-1">
                          Por defecto
                        </Badge>
                      )}
                      {v.kind === "cloned" && (
                        <Badge variant="secondary" className="ml-1">
                          Clonada
                        </Badge>
                      )}
                      {!v.is_active && (
                        <Badge variant="secondary" className="ml-1">
                          Inactiva
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {VOICE_KIND_LABELS[v.kind] ?? v.kind} · {v.provider} · {v.provider_voice_id} · {v.model_id}
                      {v.consent_recorded_at ? " · consentimiento registrado" : ""}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {users.length > 0
                        ? `La usan: ${users.map((a) => a.name).join(", ")}`
                        : v.is_default
                          ? "No la usa ningún agente en concreto, pero es la voz por defecto de la organización."
                          : "Todavía no la usa ningún agente."}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!v.is_default && (
                      <Button size="sm" variant="ghost" onClick={() => makeDefault(v.id)}>
                        <Star className="mr-1 h-4 w-4" aria-hidden="true" />
                        Usar por defecto
                      </Button>
                    )}
                    {agents.length > 0 ? (
                      <Select
                        value=""
                        disabled={assigning === v.id}
                        onValueChange={(agentId) => void assignToAgent(v, agentId)}
                      >
                        <SelectTrigger className="h-8 w-[220px] text-xs" aria-label={`Asignar la voz ${v.name} a un agente`}>
                          <SelectValue placeholder="Asignar a un agente…" />
                        </SelectTrigger>
                        <SelectContent>
                          {agents.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                              {a.voice_ref_id === v.id ? " · ya la usa" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {agentsError ? `No se pudo leer la lista de agentes: ${agentsError}` : "Crea un agente para poder asignarle esta voz."}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Añadir voces */}
      <section aria-labelledby="voces-anadir" className="space-y-3">
        <h2 id="voces-anadir" className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Añadir voces al catálogo
        </h2>
        <VoiceAddForms tts={tts} onChanged={() => void reload()} />

        {/* Clonar mi voz: el único camino que CREA una voz nueva desde aquí. */}
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
            <Upload className="h-4 w-4" aria-hidden="true" />
            Clonar mi voz
          </h3>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            Sube entre 1 y 5 muestras de audio (mp3, wav, m4a, ogg o webm; máximo 10 MB cada una) con la
            voz hablando con naturalidad. La voz se crea en ElevenLabs y queda en este catálogo, lista para
            asignársela a un agente.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cv-name">Nombre de la voz</Label>
              <Input
                id="cv-name"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                placeholder="Mi voz comercial"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cv-files">Muestras de audio</Label>
              <Input
                id="cv-files"
                type="file"
                accept="audio/*"
                multiple
                onChange={(e) => setCloneFiles(Array.from(e.target.files ?? []).slice(0, 5))}
              />
              {cloneFiles.length > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {cloneFiles.length} muestra{cloneFiles.length === 1 ? "" : "s"} seleccionada
                  {cloneFiles.length === 1 ? "" : "s"}
                </p>
              )}
            </div>
          </div>
          <div className="mt-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2 dark:border-amber-900 dark:bg-amber-950">
            <Checkbox
              id="cv-consent"
              checked={cloneConsent}
              onCheckedChange={(v) => setCloneConsent(v === true)}
            />
            <Label
              htmlFor="cv-consent"
              className="cursor-pointer text-xs font-normal text-amber-900 dark:text-amber-100"
            >
              Confirmo que esta es mi voz, o la de una persona del equipo que dio su consentimiento por
              escrito. No es la voz de un tercero (Ley 1581 de 2012 y política de ElevenLabs).
            </Label>
          </div>
          <div className="mt-3">
            <Button
              onClick={cloneVoice}
              disabled={cloning || providerBlocked}
              title={providerBlocked ? providerBlockedReason : undefined}
            >
              {cloning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Clonar voz
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
        </div>
      </section>
    </div>
  );
}
