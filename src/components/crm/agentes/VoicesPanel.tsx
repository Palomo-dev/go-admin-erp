"use client";

/**
 * Pestaña «Voces» de /app/crm/agentes-ia — rediseño UX 2026-09-14 (brief 6.1,
 * referencia ElevenLabs «Voces › Explorar»).
 *
 * Regla de pestañas (2026-10-06): «Voces» es una SECCIÓN de la página (su
 * `TabBar`); aquí dentro Biblioteca / Mis voces es la VISTA y va en un
 * `SegmentedControl` con `?vista=` (Figma 1668:165932). «Clonar una voz» es
 * una acción (botón), no una vista: abre el asistente en el mismo lugar.
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

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowLeft, Mic } from "lucide-react";
import { SegmentedControl } from "@/components/kit/SegmentedControl";
import { clasesBoton } from "@/components/kit/botonClases";
import { useOpcionUrl } from "@/components/kit/useParametroUrl";
import { PROVIDERS_SETTINGS_HREF, useVoiceCatalog } from "./useVoiceCatalog";
import { VoiceLibraryGrid } from "./voces/VoiceLibraryGrid";
import { MyVoicesPanel } from "./voces/MyVoicesPanel";
import { CloneVoiceWizard } from "./voces/CloneVoiceWizard";

const VISTAS = ["biblioteca", "mias"] as const;

export function VoicesPanel() {
  const t = useTranslations("crm.agentesIa.voces");
  const catalog = useVoiceCatalog();
  const [view, setViewUrl] = useOpcionUrl("vista", VISTAS, "biblioteca");
  const [clonando, setClonando] = useState(false);
  const setView = (v: (typeof VISTAS)[number]) => {
    setClonando(false);
    setViewUrl(v);
  };
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
        <span className="flex-1" />
        {!clonando && (
          <button type="button" className={clasesBoton({ tamano: "sm" })} onClick={() => setClonando(true)}>
            <Mic aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t("clonar")}
          </button>
        )}
      </div>

      {clonando ? (
        <div className="space-y-3">
          <button type="button" className={clasesBoton({ variante: "fantasma", tamano: "sm" })} onClick={() => setClonando(false)}>
            <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t("volver")}
          </button>
          <CloneVoiceWizard
            account={account}
            onCreated={() => {
              void reload();
            }}
          />
        </div>
      ) : view === "biblioteca" ? (
        <VoiceLibraryGrid ownedVoiceIds={ownedVoiceIds} onAdded={() => void reload()} account={account} />
      ) : (
        <MyVoicesPanel catalog={catalog} onGoToLibrary={() => setView("biblioteca")} onGoToClone={() => setClonando(true)} />
      )}
    </div>
  );
}
