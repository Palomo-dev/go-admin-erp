"use client";

/**
 * Campañas del agente IA (FASE 06 · UXM-D): topes reales y parada de emergencia.
 *
 * Los topes que se ven aquí son los que aplica el despachador:
 *  - tope diario contando TODO intento (también los fallidos),
 *  - tope por hora, independiente del anterior,
 *  - parada de emergencia (se activa sola tras 5 fallos seguidos).
 *
 * El destino se elige con pipeline → etapa (`useCrmLookups`, el mismo de
 * Automatizaciones); nadie escribe un identificador a mano. Si hay más de un
 * agente, se elige cuál llama. Contrato de la API intacto (`target_config.stage_id`).
 */

import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { Loader2, Megaphone } from "lucide-react";
import { LoadErrorState } from "@/components/common/LoadErrorState";
import { describeError, logError } from "@/lib/utils/errorMessage";
import { fetchJson } from "@/lib/utils/fetchJson";
import { useCrmLookups, type CrmLookupsState } from "@/components/crm/shared/useCrmLookups";
import type { VoiceAgentListItem } from "./AgentesIaPage";
import { buildCampaignBody, type CampaignRow } from "./campanas/campaignModel";
import { CampaignTargetPicker } from "./campanas/CampaignTargetPicker";
import { CampaignCard } from "./campanas/CampaignCard";

interface Props {
  agents: VoiceAgentListItem[];
  /** Inyectable en pruebas y arneses; en la página lo aporta `useCrmLookups`. */
  lookups?: CrmLookupsState;
}

export function AgentCampaignsPanel({ agents, lookups }: Props) {
  return lookups ? (
    <CampaignsPanelInner agents={agents} lookups={lookups} />
  ) : (
    <ConnectedPanel agents={agents} />
  );
}

function ConnectedPanel({ agents }: { agents: VoiceAgentListItem[] }) {
  const lookups = useCrmLookups();
  return <CampaignsPanelInner agents={agents} lookups={lookups} />;
}

function CampaignsPanelInner({
  agents,
  lookups,
}: {
  agents: VoiceAgentListItem[];
  lookups: CrmLookupsState;
}) {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [patching, setPatching] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>("");
  const activeAgents = agents.filter((a) => a.is_active);
  const selectableAgents = activeAgents.length > 0 ? activeAgents : agents;
  const effectiveAgentId = agentId || selectableAgents[0]?.id || "";

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const json = await fetchJson<{ success?: boolean; error?: string; data?: CampaignRow[] }>(
        "/api/crm/voice-agents/campaigns",
        { cache: "no-store" },
      );
      if (!json?.success) throw new Error(json?.error || "La respuesta no indicó éxito");
      setCampaigns(json.data ?? []);
    } catch (err) {
      logError("[AgentCampaignsPanel] cargar campañas", err);
      setLoadError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!name.trim()) {
      toast({ title: "La campaña necesita un nombre", variant: "destructive" });
      return;
    }
    if (!effectiveAgentId) {
      toast({
        title: "Primero crea un agente",
        description: "La campaña necesita un agente que llame.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/crm/voice-agents/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCampaignBody({ name, voiceAgentId: effectiveAgentId, stageId })),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || `Error ${res.status}`);
      setName("");
      setStageId(null);
      toast({
        title: "Campaña creada en borrador",
        description: "Actívala cuando quieras que empiece a llamar.",
      });
      void load();
    } catch (err) {
      toast({
        title: "No se pudo crear la campaña",
        description: describeError(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id: string, body: Record<string, unknown>, ok: string) => {
    setPatching(id);
    try {
      const res = await fetch(`/api/crm/voice-agents/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || `Error ${res.status}`);
      toast({ title: ok });
      void load();
    } catch (err) {
      toast({
        title: "No se pudo actualizar",
        description: describeError(err),
        variant: "destructive",
      });
    } finally {
      setPatching(null);
    }
  };

  return (
    <div className="space-y-5">
      <section
        aria-labelledby="c-new-title"
        className="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
      >
        <h2
          id="c-new-title"
          className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100"
        >
          <Megaphone className="h-4 w-4" aria-hidden="true" />
          Nueva campaña
        </h2>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="c-name">Nombre</Label>
            <Input
              id="c-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Seguimiento de propuestas"
            />
          </div>
          {selectableAgents.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="c-agent">Agente que llama</Label>
              <Select value={effectiveAgentId} onValueChange={setAgentId}>
                {/* Tester UXM-D: un nombre largo desbordaba 23 px a 375 px y tapaba el chevron. */}
                <SelectTrigger id="c-agent" className="[&>span]:line-clamp-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {selectableAgents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                      {a.is_active ? "" : " (inactivo)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {selectableAgents.length === 0 && (
            <p role="status" className="text-xs text-amber-800 dark:text-amber-200">
              No hay agentes: crea uno en la pestaña «Agentes» antes de lanzar una campaña.
            </p>
          )}
          <CampaignTargetPicker
            lookups={lookups}
            pipelineId={pipelineId}
            stageId={stageId}
            onChange={(n) => {
              setPipelineId(n.pipelineId);
              setStageId(n.stageId);
            }}
          />
        </div>
        <Button
          className="mt-4 w-full sm:w-auto"
          onClick={() => void create()}
          disabled={busy || selectableAgents.length === 0}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Crear campaña
        </Button>
      </section>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Cargando campañas…
        </div>
      ) : loadError ? (
        <LoadErrorState
          title="No se pudieron cargar las campañas"
          message={loadError}
          onRetry={() => void load()}
          isRetrying={loading}
        />
      ) : campaigns.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Todavía no hay campañas.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-label="Campañas">
          {campaigns.map((c) => (
            <CampaignCard
              key={c.id}
              campaign={c}
              stages={lookups.stages}
              pipelines={lookups.pipelines}
              busy={patching === c.id}
              onActivate={(row) =>
                void patch(row.id, { status: "running", emergency_stop: false }, "Campaña activada")
              }
              onStop={(row) =>
                void patch(row.id, { emergency_stop: true, status: "paused" }, "Campaña detenida")
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
