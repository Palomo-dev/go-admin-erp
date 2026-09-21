"use client";

/**
 * Pestaña «Mis voces» (brief UX 6.1): las guardadas y clonadas de la
 * organización en tarjetas; predeterminada en un clic; borrar con confirmación;
 * asignar a un agente sin salir de aquí. Lo secundario (cómo se elige la voz,
 * importar el workspace, registrar por identificador) se pliega, no se apila.
 *
 * Ronda 2: la lista se refresca en sitio (sin esqueleto) y, tras borrar, el
 * foco va a la tarjeta siguiente o a «Explorar la biblioteca» (R3); el diálogo
 * dice exactamente qué se borra y dónde (R5); si no se pudo leer la lista de
 * agentes, se dice (R7).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/use-toast";
import { AlertTriangle, ChevronDown, Info, Library, Mic, SlidersHorizontal } from "lucide-react";
import { LoadErrorState } from "@/components/common/LoadErrorState";
import { FadeIn } from "@/components/shared/motion/primitives";
import { fetchJson } from "@/lib/utils/fetchJson";
import { describeError } from "@/lib/utils/errorMessage";
import { describeVoiceRemoval } from "@/lib/services/crm/voiceLibrary";
import type { VoiceCatalogRow, VoiceCatalogState } from "../useVoiceCatalog";
import { VoiceAddForms } from "../VoiceAddForms";
import { MyVoiceCard, myVoiceCardId, type AgentLite } from "./MyVoiceCard";
import { useAudioPreview } from "./useAudioPreview";

interface Props {
  catalog: VoiceCatalogState;
  onGoToLibrary: () => void;
  onGoToClone: () => void;
}

const EMPTY_PRIMARY_ID = "my-voices-empty-explore";

async function patchJson(url: string, body: unknown) {
  const json = await fetchJson<{ success?: boolean; error?: string }>(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!json?.success) throw new Error(json?.error || "La respuesta no indicó éxito");
  return json;
}

export function MyVoicesPanel({ catalog, onGoToLibrary, onGoToClone }: Props) {
  const { voices, defaultVoice, loading, refreshing, error, tts, reload } = catalog;
  const player = useAudioPreview();
  const [agents, setAgents] = useState<AgentLite[]>([]);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<VoiceCatalogRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // R3: el disparador se captura ANTES de abrir (en un efecto, Radix ya habría
  // movido el foco al diálogo). Al cancelar, el foco vuelve a él; tras borrar ya
  // no existe y va a la tarjeta vecina o, si no queda ninguna, a «Explorar la biblioteca».
  const openerRef = useRef<HTMLElement | null>(null);
  const focusAfterDelete = useRef<string | null>(null);
  const askDelete = (voice: VoiceCatalogRow) => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setToDelete(voice);
  };
  const onCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    const opener = openerRef.current;
    const next = focusAfterDelete.current;
    openerRef.current = null;
    focusAfterDelete.current = null;
    const target =
      (opener?.isConnected ? opener : null) ??
      (next ? document.getElementById(myVoiceCardId(next)) : null) ??
      document.getElementById(EMPTY_PRIMARY_ID);
    target?.focus();
  }, []);

  const loadAgents = useCallback(async () => {
    try {
      const json = await fetchJson<{ success?: boolean; error?: string; data?: AgentLite[] }>("/api/crm/voice-agents", { cache: "no-store" });
      if (!json?.success) throw new Error(json?.error || "La respuesta no indicó éxito");
      setAgents(json.data ?? []);
      setAgentsError(null);
    } catch (err) {
      setAgents([]);
      setAgentsError(describeError(err));
    }
  }, []);

  useEffect(() => { void loadAgents(); }, [loadAgents]);

  useEffect(() => {
    if (player.status === "error" && player.error) {
      toast({ title: "No se pudo reproducir", description: player.error, variant: "destructive" });
    }
  }, [player.status, player.error]);

  const makeDefault = async (voice: VoiceCatalogRow) => {
    try {
      await patchJson("/api/crm/voices", { id: voice.id, is_default: true });
      toast({ title: `«${voice.name}» es ahora la voz por defecto`, description: "La usarán los agentes que no tengan una voz propia." });
      void reload();
    } catch (err) {
      toast({ title: "No se pudo marcar por defecto", description: describeError(err), variant: "destructive" });
    }
  };

  const assign = async (voice: VoiceCatalogRow, agentId: string) => {
    setAssigning(voice.id);
    try {
      await patchJson(`/api/crm/voice-agents/${agentId}`, { voice_ref_id: voice.id });
      toast({ title: `«${voice.name}» asignada a ${agents.find((a) => a.id === agentId)?.name ?? "el agente"}` });
      await loadAgents();
    } catch (err) {
      toast({ title: "No se pudo asignar la voz", description: describeError(err), variant: "destructive" });
    } finally {
      setAssigning(null);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const json = await fetchJson<{ success?: boolean; error?: string; data?: { removed_from_provider: boolean } }>(
        `/api/crm/voices?id=${encodeURIComponent(toDelete.id)}`,
        { method: "DELETE" }
      );
      if (!json?.success) throw new Error(json?.error || "La respuesta no indicó éxito");
      const idx = voices.findIndex((v) => v.id === toDelete.id);
      focusAfterDelete.current = (voices[idx + 1] ?? voices[idx - 1])?.id ?? null;
      toast({
        title: `«${toDelete.name}» borrada`,
        description: json.data?.removed_from_provider
          ? "También se eliminó en ElevenLabs."
          : toDelete.provider === "elevenlabs"
            ? "Solo se quitó del catálogo; en ElevenLabs sigue disponible."
            : undefined,
      });
      // Se espera a la recarga (en sitio, sin esqueleto) para que la tarjeta vecina exista al devolver el foco.
      await reload();
    } catch (err) {
      toast({ title: "No se pudo borrar la voz", description: describeError(err), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Collapsible open={howOpen} onOpenChange={setHowOpen}>
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-left text-sm text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 break-words">
              Voz por defecto: <strong>{defaultVoice ? defaultVoice.name : "ninguna (voz estándar de Google)"}</strong>. ¿Cómo se elige la voz de una llamada?
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none ${howOpen ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ol className="list-decimal space-y-0.5 rounded-b-lg border border-t-0 border-blue-200 bg-blue-50/60 px-3 py-2 pl-8 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-100">
            <li>La voz asignada a ese agente (aquí con «Asignar a un agente» o en su editor).</li>
            <li>Si no tiene, la marcada como <strong>Por defecto</strong>.</li>
            <li>Si tampoco hay, la voz estándar de Google de Twilio: funciona, pero suena genérica.</li>
          </ol>
        </CollapsibleContent>
      </Collapsible>

      {agentsError && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            No se pudo leer la lista de agentes: {agentsError}. Podrás asignar voces cuando vuelva a cargar.{" "}
            <button type="button" className="font-medium underline" onClick={() => void loadAgents()}>Reintentar</button>
          </span>
        </p>
      )}

      {loading && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Cargando mis voces">
          {[0, 1, 2].map((i) => (
            <li key={i} className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              <div className="flex items-center gap-3"><Skeleton className="h-12 w-12 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></div></div>
              <Skeleton className="mt-4 h-8 w-full" />
            </li>
          ))}
        </ul>
      )}

      {!loading && error && (
        <LoadErrorState title="No se pudo cargar el catálogo de voces" message={error} onRetry={() => void reload()} />
      )}

      {!loading && !error && voices.length === 0 && (
        <FadeIn className="rounded-xl border border-dashed border-gray-300 p-10 text-center dark:border-gray-700">
          <Mic className="mx-auto h-8 w-8 text-blue-500" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-gray-800 dark:text-gray-200">Todavía no tienes voces guardadas.</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Elige una de la biblioteca o clona la tuya. Mientras tanto, los agentes llaman con la voz estándar.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button id={EMPTY_PRIMARY_ID} className="bg-blue-600 text-white hover:bg-blue-700" onClick={onGoToLibrary}>
              <Library className="mr-2 h-4 w-4" aria-hidden="true" />Explorar la biblioteca
            </Button>
            <Button variant="outline" onClick={onGoToClone}>
              <Mic className="mr-2 h-4 w-4" aria-hidden="true" />Clonar mi voz
            </Button>
          </div>
        </FadeIn>
      )}

      {!loading && !error && voices.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Mis voces" aria-busy={refreshing || undefined}>
          {voices.map((v, i) => (
            <li key={v.id} className="h-full min-w-0">
              <FadeIn transition={{ duration: 0.2, delay: Math.min(i, 8) * 0.03 }} className="h-full">
                <MyVoiceCard
                  voice={v}
                  agents={agents}
                  previewStatus={player.statusFor(v.id)}
                  onPreview={(voice) =>
                    // Con previsualización pública del proveedor se reproduce directa; una voz
                    // clonada sin muestra pasa por el servidor, que sintetiza una frase corta.
                    player.toggle(voice.id, voice.preview_url || `/api/crm/voices/${voice.id}/preview`)
                  }
                  onMakeDefault={makeDefault}
                  onAssign={assign}
                  assigning={assigning === v.id}
                  onDelete={askDelete}
                />
              </FadeIn>
            </li>
          ))}
        </ul>
      )}

      <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
        <CollapsibleTrigger asChild>
          {/* UX móvil: el texto envuelve (antes `whitespace-nowrap` medía 598 px a 375 px). */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto w-full justify-start gap-2 whitespace-normal py-2 text-left text-gray-600 dark:text-gray-300 sm:w-auto"
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              Más opciones: importar el workspace de ElevenLabs o registrar una voz por identificador
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none ${moreOpen ? "rotate-180" : ""}`} aria-hidden="true" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <VoiceAddForms tts={tts} onChanged={() => void reload()} />
        </CollapsibleContent>
      </Collapsible>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => { if (!open) setToDelete(null); }}
        onCloseAutoFocus={onCloseAutoFocus}
        title={`¿Borrar la voz «${toDelete?.name ?? ""}»?`}
        description={toDelete ? describeVoiceRemoval(toDelete) : ""}
        confirmLabel="Borrar voz"
        variant="destructive"
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
