"use client";

/**
 * Pestaña «Voces» de /app/crm/agentes-ia — rediseño UX 2026-09-14 (brief 6.1,
 * referencia ElevenLabs «Voces › Explorar»).
 *
 * Regla de pestañas (2026-10-06): «Voces» es una SECCIÓN de la página (su
 * `TabBar`); aquí dentro Biblioteca / Mis voces es la VISTA y va en un
 * `SegmentedControl` con `?vista=` (Figma 1668:165932). «Clonar una voz» y
 * «Añadir por ID» son acciones de la cabecera de la página (Figma 1668:165932):
 * abren una hoja lateral (Figma 1672:127218 → 1676:127925), no una vista.
 *
 * Una acción principal por vista:
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

import React, { useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SegmentedControl } from "@/components/kit/SegmentedControl";
import { useOpcionUrl } from "@/components/kit/useParametroUrl";
import { PROVIDERS_SETTINGS_HREF, useVoiceCatalog } from "./useVoiceCatalog";
import { VoiceLibraryGrid } from "./voces/VoiceLibraryGrid";
import { MyVoicesPanel } from "./voces/MyVoicesPanel";
import { CloneVoiceWizard } from "./voces/CloneVoiceWizard";
import { VoiceAddForms } from "./VoiceAddForms";

const VISTAS = ["biblioteca", "mias"] as const;

/** Acción de la cabecera abierta en hoja lateral. */
export type AccionVoces = "clonar" | "anadirId" | null;

interface Props {
  accion: AccionVoces;
  onAccionChange: (accion: AccionVoces) => void;
}

export function VoicesPanel({ accion, onAccionChange }: Props) {
  const tx = useTranslations("crm.agentesIa");
  const t = useTranslations("crm.agentesIa.voces");
  const catalog = useVoiceCatalog();
  const [view, setView] = useOpcionUrl("vista", VISTAS, "biblioteca");
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
            {tx("voicesPanel.faltaClaveElevenlabsPuedes")}{" "}
            <Link href={PROVIDERS_SETTINGS_HREF} className="font-medium underline">
              {tx("voicesPanel.configuracionCrmProveedoresE")}
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
            {tx("voicesPanel.noPudoComprobarSi")}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          etiqueta={t("vistasAria")}
          valor={view}
          onValorChange={setView}
          opciones={[
            { valor: "biblioteca", etiqueta: t("biblioteca") },
            { valor: "mias", etiqueta: t("mias"), contador: voices.length > 0 ? voices.length : undefined },
          ]}
        />
      </div>

      {view === "biblioteca" ? (
        <VoiceLibraryGrid ownedVoiceIds={ownedVoiceIds} onAdded={() => void reload()} account={account} />
      ) : (
        <MyVoicesPanel catalog={catalog} onGoToLibrary={() => setView("biblioteca")} onGoToClone={() => onAccionChange("clonar")} />
      )}

      <Sheet open={accion !== null} onOpenChange={(open) => !open && onAccionChange(null)}>
        <SheetContent
          side="right"
          className="flex h-dvh w-full flex-col gap-0 overflow-hidden bg-surface p-0 motion-reduce:animate-none motion-reduce:transition-none sm:max-w-2xl"
        >
          <SheetHeader className="space-y-1 border-b border-line bg-surface px-4 pb-3 pr-12 pt-4 text-left sm:px-6">
            <SheetTitle className="text-fg">{accion === "anadirId" ? t("anadirIdTitulo") : t("clonar")}</SheetTitle>
            <SheetDescription className="text-fg-secondary">
              {accion === "anadirId" ? t("anadirIdDescripcion") : t("clonarDescripcion")}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {accion === "clonar" && <CloneVoiceWizard account={account} onCreated={() => void reload()} />}
            {accion === "anadirId" && <VoiceAddForms tts={tts} onChanged={() => void reload()} />}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
