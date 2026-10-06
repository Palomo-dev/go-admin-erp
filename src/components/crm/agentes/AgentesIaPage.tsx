"use client";

/**
 * /app/crm/agentes-ia — catálogo de agentes IA de voz de la organización (FASE 06).
 *
 * Cierra C-F6-16 (no había UI). Tres SECCIONES: Agentes, Voces y Campañas.
 * Todo pasa por rutas con `getServerOrgContext()`: cero organización en el cliente.
 *
 * Regla de pestañas (2026-10-06): las secciones son `TabBar` (subrayado) con
 * `?pestana=`; dentro de «Voces», Biblioteca/Mis voces es la VISTA y va en un
 * `SegmentedControl` (antes era al revés: control segmentado arriba y pestañas
 * debajo). El editor puede llevar a «Voces» desde su estado vacío.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { Bot, Plus } from "lucide-react";
import { EmptyState } from "@/components/kit/EmptyState";
import { PageHeader } from "@/components/kit/PageHeader";
import { idPanel, idPestana, TabBar } from "@/components/kit/TabBar";
import { clasesBoton } from "@/components/kit/botonClases";
import { useOpcionUrl, useParametrosUrl } from "@/components/kit/useParametroUrl";
import { describeError, logError } from "@/lib/utils/errorMessage";
import { fetchJson } from "@/lib/utils/fetchJson";
import { AgentEditorDialog, type AgentDraft } from "./AgentEditorDialog";
import { VoicesPanel } from "./VoicesPanel";
import { AgentCampaignsPanel } from "./AgentCampaignsPanel";

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

export function AgentesIaPage() {
  const t = useTranslations("crm.agentesIa");
  const [agents, setAgents] = useState<VoiceAgentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AgentDraft | null>(null);
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
      if (!json?.success) throw new Error(json?.error || "La respuesta no indicó éxito");
      setAgents(json.data ?? []);
    } catch (err) {
      logError("[AgentesIaPage] cargar agentes", err);
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleActive = async (agent: VoiceAgentListItem) => {
    try {
      const json = await fetchJson<{ success?: boolean; error?: string }>(
        `/api/crm/voice-agents/${agent.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: !agent.is_active }),
        }
      );
      if (!json?.success) throw new Error(json?.error || "La respuesta no indicó éxito");
      toast({ title: agent.is_active ? t("desactivado") : t("activado") });
      void load();
    } catch (err) {
      logError("[AgentesIaPage] cambiar estado de agente", err);
      toast({
        title: t("errorEstado"),
        description: describeError(err),
        variant: "destructive",
      });
    }
  };

  const nuevo = (
    <button type="button" className={clasesBoton()} onClick={() => setEditing({ mode: "create" })}>
      <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t("nuevo")}
    </button>
  );

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col gap-4 bg-canvas p-4 lg:p-6">
      <PageHeader
        titulo={t("titulo")}
        subtitulo={t("subtitulo")}
        icono={Bot}
        migas={[{ etiqueta: t("migas.crm"), href: "/app/crm" }, { etiqueta: t("titulo") }]}
        acciones={nuevo}
        movil={{ titulo: t("titulo"), accion: (
          <button type="button" aria-label={t("nuevo")} onClick={() => setEditing({ mode: "create" })} className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover">
            <Plus aria-hidden="true" className="size-5" />
          </button>
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
        {tab === "agentes" &&
          (loading ? (
            <ul aria-busy="true" aria-label={t("cargando")} className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="h-36 animate-pulse rounded-xl border border-line bg-subtle" />
              ))}
            </ul>
          ) : error ? (
            <div className="rounded-xl border border-line bg-surface">
              <EmptyState variante="error" titulo={t("error.titulo")} descripcion={error} onReintentar={() => void load()} />
            </div>
          ) : agents.length === 0 ? (
            <div className="rounded-xl border border-line bg-surface">
              <EmptyState variante="empty" icono={Bot} titulo={t("vacio.titulo")} descripcion={t("vacio.descripcion")} accion={{ etiqueta: t("vacio.crear"), onClick: () => setEditing({ mode: "create" }), icono: Plus }} />
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-label={t("pestanas.agentes")}>
              {agents.map((a) => (
                <li key={a.id} className="min-w-0 rounded-xl border border-line bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words font-medium text-fg">{a.name}</p>
                      <p className="text-xs text-fg-secondary">
                        {PROPOSITOS.includes(a.purpose_type) ? t(`propositos.${a.purpose_type}`) : a.purpose_type} · {a.llm_model} · {a.language}
                      </p>
                    </div>
                    <Badge tono={a.is_active ? "exito" : "neutro"} tamano="sm" className="shrink-0">
                      {a.is_active ? t("activo") : t("inactivo")}
                    </Badge>
                  </div>
                  <p className="mt-2 break-all text-xs text-fg-secondary">
                    {a.voice_ref_id ? t("vozCatalogo") : a.voice_id ? t("vozId", { id: a.voice_id }) : t("vozDefecto")}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button type="button" className={clasesBoton({ variante: "secundario", tamano: "sm" })} onClick={() => setEditing({ mode: "edit", id: a.id })}>
                      {t("editar")}
                    </button>
                    <button type="button" className={clasesBoton({ variante: "fantasma", tamano: "sm" })} onClick={() => toggleActive(a)}>
                      {a.is_active ? t("desactivar") : t("activar")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ))}
        {tab === "voces" && <VoicesPanel />}
        {tab === "campanas" && <AgentCampaignsPanel agents={agents} />}
      </div>

      {editing && (
        <AgentEditorDialog
          draft={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
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
