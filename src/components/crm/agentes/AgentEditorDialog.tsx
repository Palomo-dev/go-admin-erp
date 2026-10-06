"use client";

/**
 * Editor de un agente IA de voz en 5 pasos (Figma CRM 1313:773321 →
 * 1318:775924): 1 Propósito e identidad (con «Qué sabe el agente»),
 * 2 Guion por etapas, 3 Voz e idioma, 4 Herramientas y cumplimiento, 5 Probar.
 *
 * Hoja lateral a pantalla completa en móvil (`h-dvh`): cabecera fija con el
 * `Stepper` del kit («Paso N de 5 · …» y barra segmentada, cabe a 390 px y en
 * la hoja de 672 px), cuerpo con scroll y
 * pie fijo con Cancelar · Anterior · Siguiente / Guardar sobre el área segura.
 * El agente se guarda al final; las etapas (paso 2) se guardan una a una
 * porque son filas propias (`stage_agents`). Salir del paso 1 exige nombre y
 * modelo (los mismos que exige guardar).
 *
 * Los guardarraíles obligatorios (identificarse como IA, aviso de grabación y
 * baja voluntaria) no son configurables: se inyectan siempre en el runtime.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Stepper } from "@/components/kit/Stepper";
import { AvisoTonal } from "@/components/kit/AvisoTonal";
import { clasesBoton } from "@/components/kit/botonClases";
import { useVoiceCatalog } from "./useVoiceCatalog";
import { useAgentForm, type AgentDraft } from "./editor/useAgentForm";
import { AgentPurposeTab } from "./editor/AgentPurposeTab";
import { AgentScriptTab } from "./editor/AgentScriptTab";
import { QueSabeElAgente } from "./editor/QueSabeElAgente";
import { AgentStagesStep } from "./editor/AgentStagesStep";
import { AgentVoiceTab } from "./editor/AgentVoiceTab";
import { AgentToolsTab } from "./editor/AgentToolsTab";
import { AgentComplianceCards } from "./editor/AgentComplianceCards";
import { AgentTestStep, type EtapaPrueba } from "./editor/AgentTestStep";
import { PASOS_EDITOR, faltantesPaso, pasoAnterior, pasoSiguiente, type PasoEditor } from "./editor/pasosEditorLogica";

export type { AgentDraft } from "./editor/useAgentForm";

interface Props {
  draft: AgentDraft;
  onClose: () => void;
  onSaved: () => void;
  /** Cierra el editor y lleva a la pestaña «Voces» de la página (estado vacío del paso Voz). */
  onGoToVoices?: () => void;
}

export function AgentEditorDialog({ draft, onClose, onSaved, onGoToVoices }: Props) {
  const t = useTranslations("crm.agentesIa.editor");
  const { form, patch, loading, saving, save } = useAgentForm(draft);
  // Mismo catálogo (y mismo estado de credencial) que la pestaña «Voces».
  const catalog = useVoiceCatalog();
  const [paso, setPaso] = useState<PasoEditor>("proposito");
  const [intentoSalir, setIntentoSalir] = useState(false);
  const [etapas, setEtapas] = useState<EtapaPrueba[]>([]);
  const agentId = draft.mode === "edit" ? draft.id : null;
  const faltan = faltantesPaso(form, "proposito");
  const cuerpoRef = useRef<HTMLDivElement | null>(null);

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

  const ir = useCallback(
    (destino: PasoEditor) => {
      // Del paso 1 no se sale sin nombre ni modelo: lo demás depende de ellos.
      if (paso === "proposito" && destino !== "proposito" && faltan.length > 0) {
        setIntentoSalir(true);
        return;
      }
      setIntentoSalir(false);
      setPaso(destino);
      cuerpoRef.current?.scrollTo({ top: 0 });
    },
    [paso, faltan.length],
  );

  const submit = async () => {
    if (await save()) onSaved();
  };

  const siguiente = pasoSiguiente(paso);
  const anterior = pasoAnterior(paso);
  const pasos = PASOS_EDITOR.map((p) => ({ valor: p, etiqueta: t(`pasos.${p}`) }));

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex h-dvh w-full flex-col gap-0 overflow-hidden bg-surface p-0 motion-reduce:animate-none motion-reduce:transition-none sm:max-w-2xl"
        aria-describedby="ag-editor-desc"
      >
        <SheetHeader className="space-y-3 border-b border-line bg-surface px-4 pb-3 pr-12 pt-4 text-left sm:px-6">
          <div className="space-y-1">
            <SheetTitle className="text-fg">{draft.mode === "edit" ? t("tituloEditar") : t("tituloNuevo")}</SheetTitle>
            <SheetDescription id="ag-editor-desc" className="text-fg-secondary">
              {t(`descripciones.${paso}`)}
            </SheetDescription>
          </div>
          {!loading && (
            <Stepper
              variante="segmentos"
              etiqueta={t("ariaPasos")}
              pasos={pasos}
              actual={paso}
              resumenMovil={(n, total, etiqueta) => t("pasoDe", { n, total, etiqueta })}
            />
          )}
        </SheetHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-10 text-fg-secondary">
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
            {t("cargando")}
          </div>
        ) : (
          <div ref={cuerpoRef} className="min-h-0 flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6">
            {intentoSalir && faltan.length > 0 && (
              <AvisoTonal tono="advertencia" rol="alert" compacto titulo={t("faltan.titulo")} descripcion={faltan.map((f) => t(`faltan.${f}`)).join(" · ")} />
            )}
            {paso === "proposito" && (
              <>
                <AgentPurposeTab form={form} patch={patch} isNew={draft.mode === "create"} />
                <AgentScriptTab form={form} patch={patch} />
                <QueSabeElAgente />
              </>
            )}
            {paso === "etapas" && <AgentStagesStep agentId={agentId} purposeType={form.purpose_type} onEtapasChange={setEtapas} />}
            {paso === "voz" && <AgentVoiceTab form={form} patch={patch} catalog={catalog} onGoToVoices={onGoToVoices} />}
            {paso === "herramientas" && (
              <>
                <AgentToolsTab form={form} patch={patch} />
                <AgentComplianceCards />
              </>
            )}
            {paso === "probar" && <AgentTestStep form={form} agentId={agentId} etapas={etapas} />}
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-line bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:px-6">
          <p className="hidden min-w-0 flex-1 text-[13px] text-fg-secondary sm:block">{t("pie")}</p>
          <div className="flex gap-2">
            <button type="button" className={`${clasesBoton({ variante: "secundario" })} flex-1 sm:flex-none`} onClick={onClose}>
              {t("cancelar")}
            </button>
            {anterior && (
              <button type="button" className={`${clasesBoton({ variante: "secundario" })} flex-1 sm:flex-none`} onClick={() => ir(anterior)} disabled={loading}>
                <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t("anterior")}
              </button>
            )}
            {siguiente ? (
              <button type="button" className={`${clasesBoton()} flex-1 sm:flex-none`} onClick={() => ir(siguiente)} disabled={loading}>
                <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t("siguiente")}
              </button>
            ) : (
              <button type="button" className={`${clasesBoton()} flex-1 sm:flex-none`} onClick={() => void submit()} disabled={saving || loading}>
                {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {saving ? t("guardando") : t("guardar")}
              </button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
