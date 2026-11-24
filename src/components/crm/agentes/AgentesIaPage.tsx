"use client";

/**
 * /app/crm/agentes-ia — catálogo de agentes IA de voz de la organización (FASE 06).
 *
 * Cierra C-F6-16 (no había UI). Tres SECCIONES: Agentes, Voces y Campañas.
 * Los ajustes de la organización (interruptor del agente, números de prueba y
 * «Cuando el cliente no tiene interés») viven en Configuración › CRM › Agente
 * de voz desde 2026-10-07; aquí solo queda el atajo «Configurar». La pestaña
 * vieja `?pestana=ajustes` redirige allí (next.config.js).
 * Todo pasa por rutas con `getServerOrgContext()`: cero organización en el cliente.
 *
 * Regla de pestañas (2026-10-06): las secciones son `TabBar` (subrayado) con
 * `?pestana=`; dentro de «Voces», Biblioteca/Mis voces es la VISTA y va en un
 * `SegmentedControl` (antes era al revés: control segmentado arriba y pestañas
 * debajo). El editor puede llevar a «Voces» desde su estado vacío.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "@/components/ui/use-toast";
import { Bot, Megaphone, Mic, Play, Plus, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/kit/PageHeader";
import { RowActionsMenu } from "@/components/kit/RowActionsMenu";
import { idPanel, idPestana, TabBar } from "@/components/kit/TabBar";
import { clasesBoton } from "@/components/kit/botonClases";
import { useOpcionUrl, useParametrosUrl } from "@/components/kit/useParametroUrl";
import { describeError, logError } from "@/lib/utils/errorMessage";
import { fetchJson } from "@/lib/utils/fetchJson";
import { AgentEditorDialog, type AgentDraft } from "./AgentEditorDialog";
import { VoicesPanel, type AccionVoces } from "./VoicesPanel";
import { AgentCampaignsPanel } from "./AgentCampaignsPanel";
import { AtajoConfigurar } from "@/components/configuracion/AtajoConfigurar";
import { useVoiceCatalog } from "./useVoiceCatalog";
import { AgentesListado } from "./listado/AgentesListado";
import { useMetricasAgentes } from "./listado/useMetricasAgentes";
import type { PasoEditor } from "./editor/pasosEditorLogica";

export interface VoiceAgentListItem {
  id: string;
  name: string;
  purpose_type: string;
  engine: string;
  language: string;
  llm_model: string;
  voice_id: string | null;
  voice_ref_id: string | null;
  is_active: boolean;
  allowed_tools: string[];
}

/** `voice_agents.purpose_type` (CHECK de 10 opciones) → clave `crm.agentesIa.propositos.*`. */
const PROPOSITOS: readonly string[] = [
  "qualify_lead",
  "confirm_demo",
  "follow_up_proposal",
  "reactivate_cold",
  "collect_payment",
  "nps_survey",
  "renewal_reminder",
  "sell_product",
  "book_meeting",
  "custom",
];

const SECCIONES = ["agentes", "voces", "campanas"] as const;

/** Ventana de las cifras del listado (Figma: «Llamadas del agente (7 días)»). */
const DIAS_LISTADO = 7;

export function AgentesIaPage() {
  const t = useTranslations("crm.agentesIa");
  const [agents, setAgents] = useState<VoiceAgentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AgentDraft | null>(null);
  const [pasoInicial, setPasoInicial] = useState<PasoEditor>("proposito");
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [accionVoces, setAccionVoces] = useState<AccionVoces>(null);
  const metricas = useMetricasAgentes(DIAS_LISTADO);
  const catalogo = useVoiceCatalog();
  const [tab] = useOpcionUrl("pestana", SECCIONES, "agentes");
  const url = useParametrosUrl();
  // Cambiar de sección limpia la vista de la anterior (`?vista=` de Voces).
  const setTab = (v: (typeof SECCIONES)[number]) => url.fijar({ pestana: v === "agentes" ? null : v, vista: null });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchJson<{ success?: boolean; error?: string; data?: VoiceAgentListItem[] }>(
        "/api/crm/voice-agents",
        { cache: "no-store" }
      );
      if (!json?.success) throw new Error(json?.error || t("agentCampaignsPanel.respuestaNoIndicoExito"));
      setAgents(json.data ?? []);
    } catch (err) {
      logError("[AgentesIaPage] cargar agentes", err);
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const abrirEditor = (draft: AgentDraft, paso: PasoEditor = "proposito") => {
    setPasoInicial(paso);
    setEditing(draft);
  };

  const toggleActive = async (agent: VoiceAgentListItem) => {
    setCambiando(agent.id);
    try {
      const json = await fetchJson<{ success?: boolean; error?: string }>(
        `/api/crm/voice-agents/${agent.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: !agent.is_active }),
        }
      );
      if (!json?.success) throw new Error(json?.error || t("agentCampaignsPanel.respuestaNoIndicoExito"));
      toast({ title: agent.is_active ? t("desactivado") : t("activado") });
      void load();
    } catch (err) {
      logError("[AgentesIaPage] cambiar estado de agente", err);
      toast({
        title: t("errorEstado"),
        description: describeError(err),
        variant: "destructive",
      });
    } finally {
      setCambiando(null);
    }
  };

  const activos = agents.filter((a) => a.is_active).length;
  const subtitulo = loading ? (
    t("cargando")
  ) : error ? (
    t("listado.subtituloError")
  ) : agents.length === 0 ? (
    t("listado.subtituloVacio")
  ) : (
    t("listado.subtitulo", { total: agents.length, activos })
  );
  const etiquetaProposito = (p: string) => (PROPOSITOS.includes(p) ? t(`propositos.${p}`) : p);

  const accionesVoces = (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={clasesBoton({ variante: "secundario" })} onClick={() => setAccionVoces("anadirId")}>
        <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t("voces.anadirId")}
      </button>
      <button type="button" className={clasesBoton()} onClick={() => setAccionVoces("clonar")}>
        <Mic aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t("voces.clonar")}
      </button>
    </div>
  );

  const nuevo = (
    <div className="flex flex-wrap items-center gap-2">
      {error && (
        <button type="button" className={clasesBoton({ variante: "secundario", className: "w-10 px-0" })} aria-label={t("listado.recargar")} title={t("listado.recargar")} onClick={() => { void load(); void metricas.recargar(); }}>
          <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
      )}
      <AtajoConfigurar seccion="crm.agente-voz" />
      {agents.length > 0 && (
        <RowActionsMenu
          etiquetaBoton={t("listado.probar")}
          iconoBoton={Play}
          titulo={t("listado.probarAria")}
          acciones={agents.map((a) => ({ id: a.id, etiqueta: a.name, icono: Bot, onSelect: () => abrirEditor({ mode: "edit", id: a.id }, "probar") }))}
        />
      )}
      <button type="button" className={clasesBoton()} onClick={() => abrirEditor({ mode: "create" })}>
        <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t("nuevo")}
      </button>
      <RowActionsMenu
        orientacion="horizontal"
        tamano="md"
        titulo={t("listado.masAcciones")}
        acciones={[
          { id: "voces", etiqueta: t("listado.verVoces"), icono: Mic, onSelect: () => setTab("voces") },
          { id: "campanas", etiqueta: t("listado.verCampanas"), icono: Megaphone, onSelect: () => setTab("campanas") },
        ]}
      />
    </div>
  );

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col gap-4 bg-canvas p-4 lg:p-6">
      <PageHeader
        titulo={t("titulo")}
        subtitulo={tab === "agentes" ? subtitulo : tab === "voces" ? t("voces.subtitulo") : t("subtitulo")}
        cargando={tab === "agentes" && loading}
        icono={Bot}
        migas={[{ etiqueta: t("migas.crm"), href: "/app/crm" }, { etiqueta: t("titulo") }]}
        acciones={tab === "voces" ? accionesVoces : nuevo}
        movil={{ titulo: t("titulo"), accion: (
          <div className="flex items-center">
            <AtajoConfigurar seccion="crm.agente-voz" soloIcono />
            {tab === "voces" ? (
              <button type="button" aria-label={t("voces.clonar")} onClick={() => setAccionVoces("clonar")} className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover">
                <Mic aria-hidden="true" className="size-5" />
              </button>
            ) : (
              <button type="button" aria-label={t("nuevo")} onClick={() => abrirEditor({ mode: "create" })} className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover">
                <Plus aria-hidden="true" className="size-5" />
              </button>
            )}
          </div>
        ) }}
        debajo={
          <TabBar
            id="agentes-ia"
            etiqueta={t("pestanas.aria")}
            valor={tab}
            onValorChange={setTab}
            pestanas={SECCIONES.map((v) => ({ valor: v, etiqueta: t(`pestanas.${v}`), contador: v === "agentes" && !loading && !error ? agents.length : undefined }))}
          />
        }
      />

      <div role="tabpanel" id={idPanel("agentes-ia", tab)} aria-labelledby={idPestana("agentes-ia", tab)} className="min-w-0">
        {tab === "agentes" && (
          <AgentesListado
            agentes={agents}
            cargando={loading}
            error={error}
            metricas={metricas.datos}
            cargandoMetricas={metricas.cargando}
            voces={catalogo.voices}
            dias={DIAS_LISTADO}
            cambiando={cambiando}
            etiquetaProposito={etiquetaProposito}
            onReintentar={() => { void load(); void metricas.recargar(); }}
            onCrear={() => abrirEditor({ mode: "create" })}
            onVerVoces={() => setTab("voces")}
            onEditar={(id) => abrirEditor({ mode: "edit", id })}
            onCambiarActivo={(a) => void toggleActive(a as VoiceAgentListItem)}
          />
        )}
        {tab === "voces" && <VoicesPanel accion={accionVoces} onAccionChange={setAccionVoces} />}
        {tab === "campanas" && <AgentCampaignsPanel agents={agents} />}
      </div>

      {editing && (
        <AgentEditorDialog
          draft={editing}
          pasoInicial={pasoInicial}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
            void metricas.recargar();
          }}
          onGoToVoices={() => {
            setEditing(null);
            setTab("voces");
          }}
        />
      )}
    </div>
  );
}
