"use client";

/**
 * Pestaña «Voces» de /app/crm/agentes-ia — rediseño UX 2026-09-14 (brief 6.1,
 * referencia ElevenLabs «Voces › Explorar»).
 *
 * Tres vistas, una acción principal cada una:
 *  - Biblioteca: la biblioteca pública de ElevenLabs en tarjetas con avatar,
 *    etiquetas, «Escuchar» y «Añadir a mis voces» (`voces/VoiceLibraryGrid`).
 *  - Mis voces: las guardadas y clonadas; predeterminada en un clic, asignar a
 *    un agente y borrar con confirmación (`voces/MyVoicesPanel`). Importar el
 *    workspace y registrar por identificador siguen ahí, plegados.
 *  - Clonar mi voz: consentimiento (Habeas Data), guion en pantalla, grabadora
 *    con medidor, escucha y nombre (`voces/CloneVoiceWizard`).
 *
 * Todo pasa por rutas con `getServerOrgContext()`: cero organización en el
 * cliente y la clave del proveedor nunca sale del servidor.
 *
 * D9: no se clona la voz de un tercero. Sin consentimiento no se llama al
 * proveedor, y la base lo impone además con el CHECK `voices_cloned_requires_consent`.
 */

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Library, Mic, UserRound } from "lucide-react";
import { PROVIDERS_SETTINGS_HREF, useVoiceCatalog } from "./useVoiceCatalog";
import { VoiceLibraryGrid } from "./voces/VoiceLibraryGrid";
import { MyVoicesPanel } from "./voces/MyVoicesPanel";
import { CloneVoiceWizard } from "./voces/CloneVoiceWizard";

type View = "biblioteca" | "mias" | "clonar";

export function VoicesPanel() {
  const catalog = useVoiceCatalog();
  const [view, setView] = useState<View>("biblioteca");
  const { voices, tts, account, reload } = catalog;

  const ownedVoiceIds = useMemo(
    () => new Set(voices.filter((v) => v.provider === "elevenlabs").map((v) => v.provider_voice_id)),
    [voices]
  );

  return (
    <div className="space-y-4">
      {!tts.unknown && !tts.ready && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Falta la clave de ElevenLabs: puedes explorar la biblioteca, pero no añadir, clonar ni reproducir voces
            en llamadas hasta guardarla en{" "}
            <Link href={PROVIDERS_SETTINGS_HREF} className="font-medium underline">
              Configuración › CRM › Proveedores e IA
            </Link>
            .
          </p>
        </div>
      )}
      {tts.unknown && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-gray-300 bg-gray-50 p-3 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            No se pudo comprobar si hay clave de ElevenLabs configurada (falló la lectura de Proveedores e IA).
            Añadir, clonar o escuchar pueden fallar con el error del proveedor.
          </span>
        </div>
      )}

      <Tabs value={view} onValueChange={(v) => setView(v as View)}>
        {/* UX móvil: tres columnas iguales, icono sobre etiqueta a 375 px (antes `inline-flex` medía 417 px y desbordaba). */}
        <TabsList aria-label="Vistas de voces" className="grid h-auto w-full grid-cols-3 sm:inline-flex sm:w-auto">
          <TabsTrigger value="biblioteca" className="min-w-0 flex-col gap-0.5 px-1 py-1.5 text-xs sm:flex-row sm:gap-1.5 sm:px-3 sm:text-sm">
            <Library className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="max-w-full truncate">Biblioteca</span>
          </TabsTrigger>
          {/* R10: el lector anuncia «Mis voces, 5 voces», no «Mis voces5». */}
          <TabsTrigger
            value="mias"
            className="min-w-0 flex-col gap-0.5 px-1 py-1.5 text-xs sm:flex-row sm:gap-1.5 sm:px-3 sm:text-sm"
            aria-label={voices.length > 0 ? `Mis voces, ${voices.length}` : undefined}
          >
            <UserRound className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex min-w-0 max-w-full items-center gap-1">
              <span className="truncate">Mis voces</span>
              {voices.length > 0 && (
                <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[10px] sm:h-5 sm:px-1.5 sm:text-xs" aria-hidden="true">
                  {voices.length}
                </Badge>
              )}
            </span>
          </TabsTrigger>
          <TabsTrigger value="clonar" className="min-w-0 flex-col gap-0.5 px-1 py-1.5 text-xs sm:flex-row sm:gap-1.5 sm:px-3 sm:text-sm">
            <Mic className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="max-w-full truncate">Clonar mi voz</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="biblioteca" className="pt-4">
          <VoiceLibraryGrid ownedVoiceIds={ownedVoiceIds} onAdded={() => void reload()} account={account} />
        </TabsContent>

        <TabsContent value="mias" className="pt-4">
          <MyVoicesPanel catalog={catalog} onGoToLibrary={() => setView("biblioteca")} onGoToClone={() => setView("clonar")} />
        </TabsContent>

        <TabsContent value="clonar" className="pt-4">
          <CloneVoiceWizard
            account={account}
            onCreated={() => {
              void reload();
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
