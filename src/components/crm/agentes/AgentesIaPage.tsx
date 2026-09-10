"use client";

/**
 * /app/crm/agentes-ia — catálogo de agentes IA de voz de la organización (FASE 06).
 *
 * Cierra C-F6-16 (no había UI). Tres pestañas: Agentes, Voces y Campañas.
 * Todo pasa por rutas con `getServerOrgContext()`: cero organización en el cliente.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";
import { Bot, Loader2, Plus, Mic, Megaphone } from "lucide-react";
import { LoadErrorState } from "@/components/common/LoadErrorState";
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

const PURPOSE_LABELS: Record<string, string> = {
  qualify_lead: "Calificar contacto",
  confirm_demo: "Confirmar demo",
  follow_up_proposal: "Seguimiento de propuesta",
  reactivate_cold: "Reactivar frío",
  collect_payment: "Cobro",
  nps_survey: "Encuesta NPS",
  renewal_reminder: "Renovación",
  sell_product: "Vender producto",
  book_meeting: "Agendar reunión",
  custom: "Personalizado",
};

export function AgentesIaPage() {
  const [agents, setAgents] = useState<VoiceAgentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AgentDraft | null>(null);

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
      toast({ title: agent.is_active ? "Agente desactivado" : "Agente activado" });
      void load();
    } catch (err) {
      logError("[AgentesIaPage] cambiar estado de agente", err);
      toast({
        title: "No se pudo cambiar el estado",
        description: describeError(err),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Agentes IA de voz</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Quién llama, con qué voz y con qué objetivo. El guion por etapa se configura en el embudo.
            </p>
          </div>
        </div>
        <Button onClick={() => setEditing({ mode: "create" })}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Nuevo agente
        </Button>
      </header>

      <Tabs defaultValue="agentes">
        <TabsList>
          <TabsTrigger value="agentes">
            <Bot className="mr-2 h-4 w-4" aria-hidden="true" />
            Agentes
          </TabsTrigger>
          <TabsTrigger value="voces">
            <Mic className="mr-2 h-4 w-4" aria-hidden="true" />
            Voces
          </TabsTrigger>
          <TabsTrigger value="campanas">
            <Megaphone className="mr-2 h-4 w-4" aria-hidden="true" />
            Campañas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agentes" className="pt-4">
          {loading && (
            <div className="flex items-center gap-2 py-10 text-gray-500 dark:text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Cargando agentes…
            </div>
          )}

          {!loading && error && (
            <LoadErrorState
              title="No se pudieron cargar los agentes"
              message={error}
              onRetry={() => void load()}
              isRetrying={loading}
            />
          )}

          {!loading && !error && agents.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center dark:border-gray-700">
              <Bot className="mx-auto h-8 w-8 text-gray-400" aria-hidden="true" />
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                Todavía no hay agentes. Crea uno y luego dile en cada etapa del embudo qué debe conseguir.
              </p>
              <Button className="mt-4" onClick={() => setEditing({ mode: "create" })}>
                Crear el primer agente
              </Button>
            </div>
          )}

          {!loading && !error && agents.length > 0 && (
            <ul className="grid gap-3 md:grid-cols-2">
              {agents.map((a) => (
                <li
                  key={a.id}
                  className="rounded-lg border border-gray-200 p-4 dark:border-gray-700 dark:bg-gray-900"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{a.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {PURPOSE_LABELS[a.purpose_type] ?? a.purpose_type} · {a.llm_model} · {a.language}
                      </p>
                    </div>
                    <Badge variant={a.is_active ? "success" : "secondary"}>
                      {a.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {a.voice_ref_id
                      ? "Voz del catálogo (puede ser la voz clonada del vendedor)"
                      : a.voice_id
                        ? `Voz: ${a.voice_id}`
                        : "Sin voz propia: se usará la voz por defecto"}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing({ mode: "edit", id: a.id })}>
                      Editar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(a)}>
                      {a.is_active ? "Desactivar" : "Activar"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="voces" className="pt-4">
          <VoicesPanel />
        </TabsContent>

        <TabsContent value="campanas" className="pt-4">
          <AgentCampaignsPanel agents={agents} />
        </TabsContent>
      </Tabs>

      {editing && (
        <AgentEditorDialog
          draft={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
