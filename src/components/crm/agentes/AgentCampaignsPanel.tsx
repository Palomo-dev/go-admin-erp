"use client";

/**
 * Campañas del agente IA (FASE 06): topes reales y parada de emergencia.
 *
 * Los topes que se ven aquí son los que aplica el despachador:
 *  - tope diario contando TODO intento (también los fallidos),
 *  - tope por hora, independiente del anterior,
 *  - parada de emergencia (se activa sola tras 5 fallos seguidos).
 */

import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { Loader2, Megaphone, OctagonX, Play } from "lucide-react";
import { LoadErrorState } from "@/components/common/LoadErrorState";
import { describeError, logError } from "@/lib/utils/errorMessage";
import { fetchJson } from "@/lib/utils/fetchJson";
import type { VoiceAgentListItem } from "./AgentesIaPage";

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  target_source: string;
  max_calls_per_day: number;
  max_calls_per_hour: number;
  max_concurrent: number;
  emergency_stop: boolean;
  stopped_reason: string | null;
  voice_agents?: { name: string } | null;
}

export function AgentCampaignsPanel({ agents }: { agents: VoiceAgentListItem[] }) {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [stageId, setStageId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const json = await fetchJson<{ success?: boolean; error?: string; data?: CampaignRow[] }>(
        "/api/crm/voice-agents/campaigns",
        { cache: "no-store" }
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
    if (!name.trim() || agents.length === 0) {
      toast({ title: "Falta el nombre o no hay agentes creados", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/crm/voice-agents/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          voice_agent_id: agents[0].id,
          target_source: stageId ? "pipeline_stage" : "manual_list",
          target_config: stageId ? { stage_id: stageId } : {},
          max_calls_per_day: 50,
          max_calls_per_hour: 20,
          max_concurrent: 3,
          status: "draft",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || `Error ${res.status}`);
      setName("");
      setStageId("");
      toast({ title: "Campaña creada en borrador" });
      void load();
    } catch (err) {
      toast({
        title: "No se pudo crear la campaña",
        description: err instanceof Error ? err.message : "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id: string, body: Record<string, unknown>, ok: string) => {
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
        description: err instanceof Error ? err.message : "Error desconocido",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
          <Megaphone className="h-4 w-4" aria-hidden="true" />
          Nueva campaña
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="c-name">Nombre</Label>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-stage">ID de la etapa (opcional)</Label>
            <Input
              id="c-stage"
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              placeholder="Llama a las oportunidades de esa etapa"
            />
          </div>
        </div>
        <Button className="mt-3" onClick={create} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Crear campaña
        </Button>
      </div>

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
        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
          {campaigns.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {c.name}{" "}
                  <Badge variant={c.emergency_stop ? "destructive" : c.status === "running" ? "success" : "secondary"}>
                    {c.emergency_stop ? "Detenida" : c.status}
                  </Badge>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Máx. {c.max_calls_per_day}/día · {c.max_calls_per_hour}/hora · {c.max_concurrent} simultáneas
                  {c.stopped_reason ? ` · ${c.stopped_reason}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                {c.emergency_stop || c.status !== "running" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => patch(c.id, { status: "running", emergency_stop: false }, "Campaña activada")}
                  >
                    <Play className="mr-1 h-4 w-4" aria-hidden="true" />
                    Activar
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => patch(c.id, { emergency_stop: true, status: "paused" }, "Campaña detenida")}
                  >
                    <OctagonX className="mr-1 h-4 w-4" aria-hidden="true" />
                    Parada de emergencia
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
