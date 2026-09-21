"use client";

/**
 * Pestaña «Biblioteca» de Voces (brief UX 6.1): filtros arriba, cuadrícula de
 * tarjetas con avatar, previsualización (una sola a la vez) y «Añadir a mis
 * voces». Scroll incremental con centinela + botón «Cargar más» accesible.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { Loader2, Music4 } from "lucide-react";
import { LoadErrorState } from "@/components/common/LoadErrorState";
import { FadeIn } from "@/components/shared/motion";
import { fetchJson } from "@/lib/utils/fetchJson";
import { describeError } from "@/lib/utils/errorMessage";
import type { LibraryVoice } from "@/lib/services/crm/voiceLibrary";
import type { VoiceAccountInfo } from "../useVoiceCatalog";
import { useVoiceLibrary } from "./useVoiceLibrary";
import { useAudioPreview } from "./useAudioPreview";
import { VoiceLibraryFilters } from "./VoiceLibraryFilters";
import { VoiceCard } from "./VoiceCard";

interface Props {
  /** `provider_voice_id` de las voces que ya están en «Mis voces». */
  ownedVoiceIds: Set<string>;
  onAdded: () => void;
  /** Plan del proveedor según el servidor (`null` si no se sabe): avisa antes del clic en voces de pago. */
  account: VoiceAccountInfo | null;
}

const SKELETONS = Array.from({ length: 8 }, (_, i) => i);

export function VoiceLibraryGrid({ ownedVoiceIds, onAdded, account }: Props) {
  const lib = useVoiceLibrary();
  const player = useAudioPreview();
  const [adding, setAdding] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (player.status === "error" && player.error) {
      toast({ title: "No se pudo reproducir", description: player.error, variant: "destructive" });
    }
  }, [player.status, player.error]);

  // Scroll incremental: cuando el centinela entra en pantalla, pide la página siguiente.
  const { hasMore, loadMore } = lib;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    }, { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  const add = useCallback(
    async (voice: LibraryVoice) => {
      setAdding(voice.voice_id);
      try {
        const json = await fetchJson<{ success?: boolean; error?: string; data?: { already_in_catalog: boolean } }>(
          "/api/crm/voices/library",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              voice_id: voice.voice_id,
              public_owner_id: voice.public_owner_id,
              name: voice.name,
              description: voice.description,
              language: voice.language,
            }),
          }
        );
        if (!json?.success) throw new Error(json?.error || "La respuesta no indicó éxito");
        setJustAdded((prev) => new Set(prev).add(voice.voice_id));
        toast({
          title: json.data?.already_in_catalog ? `«${voice.name}» ya estaba en tus voces` : `«${voice.name}» añadida a tus voces`,
          description: "Puedes marcarla por defecto o asignársela a un agente en la pestaña Mis voces.",
        });
        onAdded();
      } catch (err) {
        toast({ title: "No se pudo añadir la voz", description: describeError(err), variant: "destructive" });
      } finally {
        setAdding(null);
      }
    },
    [onAdded]
  );

  return (
    <div className="space-y-4">
      <VoiceLibraryFilters
        filters={lib.filters}
        onChange={lib.setFilter}
        onClear={lib.clearFilters}
        resultCount={lib.voices.length}
        totalCount={lib.totalCount}
      />

      {lib.loading && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Cargando voces">
          {SKELETONS.map((i) => (
            <li key={i} className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <Skeleton className="mt-3 h-3 w-full" />
              <div className="mt-3 flex gap-1.5">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <div className="mt-4 flex justify-between">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-20" />
              </div>
            </li>
          ))}
        </ul>
      )}

      {!lib.loading && lib.error && (
        <LoadErrorState title="No se pudo cargar la biblioteca de ElevenLabs" message={lib.error} onRetry={lib.retry} />
      )}

      {!lib.loading && !lib.error && lib.voices.length === 0 && (
        <FadeIn className="rounded-xl border border-dashed border-gray-300 p-10 text-center dark:border-gray-700">
          <Music4 className="mx-auto h-8 w-8 text-blue-500" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-gray-800 dark:text-gray-200">Ninguna voz coincide con esos filtros.</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Prueba con otra palabra o quita algún filtro.</p>
          <Button className="mt-4" variant="outline" onClick={lib.clearFilters}>Limpiar filtros</Button>
        </FadeIn>
      )}

      {!lib.loading && !lib.error && lib.voices.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Voces de la biblioteca">
          {lib.voices.map((v, i) => (
            <li key={v.voice_id} className="h-full min-w-0">
              <FadeIn transition={{ duration: 0.2, delay: Math.min(i % 24, 12) * 0.02 }} className="h-full">
                <VoiceCard
                  voice={v}
                  previewStatus={player.statusFor(v.voice_id)}
                  onPreview={(voice) => voice.preview_url && player.toggle(voice.voice_id, voice.preview_url)}
                  added={ownedVoiceIds.has(v.voice_id) || justAdded.has(v.voice_id)}
                  adding={adding === v.voice_id}
                  onAdd={add}
                  accountIsFree={account ? account.free_tier : null}
                />
              </FadeIn>
            </li>
          ))}
        </ul>
      )}

      <div ref={sentinelRef} aria-hidden="true" />
      {!lib.loading && !lib.error && lib.hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={lib.loadMore} disabled={lib.loadingMore}>
            {lib.loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {lib.loadingMore ? "Cargando más voces…" : "Cargar más voces"}
          </Button>
        </div>
      )}
    </div>
  );
}
