"use client";

/**
 * Editor de un agente IA de voz (FASE 06 · UX móvil ronda 1, UXM-D).
 *
 * Hoja lateral a pantalla completa en móvil (`h-dvh`): cabecera fija, pestañas
 * como cuatro pasos iguales con icono y «paso N de 4», cuerpo con scroll propio
 * y pie fijo con Cancelar / Guardar sobre el área segura. Cada pestaña vive en
 * `editor/`; el estado y la persistencia en `editor/useAgentForm`.
 *
 * Los guardarraíles obligatorios (identificarse como IA, aviso de grabación y baja
 * voluntaria) no son configurables: se inyectan siempre en el runtime.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, Mic, ScrollText, Target, Wrench } from "lucide-react";
import { useVoiceCatalog } from "./useVoiceCatalog";
import { useAgentForm, type AgentDraft } from "./editor/useAgentForm";
import { AgentPurposeTab } from "./editor/AgentPurposeTab";
import { AgentScriptTab } from "./editor/AgentScriptTab";
import { AgentVoiceTab } from "./editor/AgentVoiceTab";
import { AgentToolsTab } from "./editor/AgentToolsTab";

export type { AgentDraft } from "./editor/useAgentForm";

type TabKey = "proposito" | "guion" | "voz" | "tools";

const TABS: Array<{ key: TabKey; label: string; Icon: typeof Target }> = [
  { key: "proposito", label: "Propósito", Icon: Target },
  { key: "guion", label: "Guion", Icon: ScrollText },
  { key: "voz", label: "Voz", Icon: Mic },
  { key: "tools", label: "Herramientas", Icon: Wrench },
];

interface Props {
  draft: AgentDraft;
  onClose: () => void;
  onSaved: () => void;
  /** Cierra el editor y lleva a la pestaña «Voces» de la página (estado vacío de la pestaña Voz). */
  onGoToVoices?: () => void;
}

export function AgentEditorDialog({ draft, onClose, onSaved, onGoToVoices }: Props) {
  const { form, patch, loading, saving, save } = useAgentForm(draft);
  // Mismo catálogo (y mismo estado de credencial) que la pestaña «Voces».
  const catalog = useVoiceCatalog();
  const [tab, setTab] = useState<TabKey>("proposito");
  const step = TABS.findIndex((t) => t.key === tab) + 1;
  // La página desmonta el editor al cerrar (sin animación de salida), así que el
  // foco no vuelve solo al botón que lo abrió: se captura al montar y se devuelve.
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const opener = openerRef.current;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const submit = async () => {
    if (await save()) onSaved();
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex h-dvh w-full flex-col gap-0 overflow-hidden bg-white p-0 motion-reduce:animate-none motion-reduce:transition-none dark:bg-gray-950 sm:max-w-2xl"
        aria-describedby="ag-editor-desc"
      >
        <SheetHeader className="space-y-1 border-b border-gray-200 bg-white px-4 pb-3 pr-12 pt-4 text-left dark:border-gray-800 dark:bg-gray-900 sm:px-6">
          <SheetTitle className="text-gray-900 dark:text-gray-100">
            {draft.mode === "edit" ? "Editar agente IA" : "Nuevo agente IA"}
          </SheetTitle>
          <SheetDescription id="ag-editor-desc" className="text-gray-600 dark:text-gray-400">
            Define cómo habla el agente. Lo que debe conseguir en cada etapa se configura en el
            embudo.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-10 text-gray-500 dark:text-gray-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Cargando…
          </div>
        ) : (
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as TabKey)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="border-b border-gray-200 bg-white px-4 py-2 dark:border-gray-800 dark:bg-gray-900 sm:px-6">
              <p
                className="mb-1.5 text-xs text-gray-500 dark:text-gray-400 sm:hidden"
                aria-live="polite"
              >
                Paso {step} de {TABS.length}
              </p>
              {/* Cuatro pasos iguales: icono sobre etiqueta a 375 px (cabe «Herramientas» sin
                  desbordar ni desplazar); en línea desde `sm`. */}
              <TabsList
                aria-label="Secciones del agente"
                className="grid h-auto w-full grid-cols-4 p-1"
              >
                {TABS.map(({ key, label, Icon }) => (
                  <TabsTrigger
                    key={key}
                    value={key}
                    className="min-w-0 flex-col gap-0.5 px-1 py-1.5 text-xs sm:flex-row sm:gap-1.5 sm:px-3 sm:text-sm"
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {/* Tester UXM-D: en columna, `items-center` no acota el ancho del span; a 320 px «Herramientas» sobresalía 8 px del botón. */}
                    <span className="max-w-full truncate">{label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
              <TabsContent value="proposito" className="mt-0">
                <AgentPurposeTab form={form} patch={patch} isNew={draft.mode === "create"} />
              </TabsContent>
              <TabsContent value="guion" className="mt-0">
                <AgentScriptTab form={form} patch={patch} />
              </TabsContent>
              <TabsContent value="voz" className="mt-0">
                <AgentVoiceTab
                  form={form}
                  patch={patch}
                  catalog={catalog}
                  onGoToVoices={onGoToVoices}
                />
              </TabsContent>
              <TabsContent value="tools" className="mt-0">
                <AgentToolsTab form={form} patch={patch} />
              </TabsContent>
            </div>
          </Tabs>
        )}

        <div className="flex gap-2 border-t border-gray-200 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-gray-800 dark:bg-gray-900 sm:justify-end sm:px-6">
          <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="flex-1 bg-blue-600 text-white hover:bg-blue-700 sm:flex-none"
            onClick={() => void submit()}
            disabled={saving || loading}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Guardando…
              </>
            ) : (
              "Guardar agente"
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
