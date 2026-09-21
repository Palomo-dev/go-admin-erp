"use client";

/**
 * Tarjeta de una campaña (UXM-D): estado legible, destino en lenguaje humano,
 * agente, topes y una sola acción (Activar / Parada de emergencia) a ancho
 * completo en móvil.
 */

import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, OctagonX, Play } from "lucide-react";
import type { PipelineOption, StageOption } from "@/components/crm/shared/useCrmLookups";
import {
  campaignCanActivate,
  campaignStatusView,
  describeCampaignTarget,
  type CampaignRow,
} from "./campaignModel";

interface Props {
  campaign: CampaignRow;
  stages: StageOption[];
  pipelines: PipelineOption[];
  busy: boolean;
  onActivate: (c: CampaignRow) => void;
  onStop: (c: CampaignRow) => void;
}

export function CampaignCard({ campaign: c, stages, pipelines, busy, onActivate, onStop }: Props) {
  const status = campaignStatusView(c);
  const canActivate = campaignCanActivate(c);
  return (
    <li className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 break-words text-sm font-semibold text-gray-900 dark:text-gray-100">
          {c.name}
        </h3>
        {/* Tester UXM-D: `destructive` del Badge da 3,76:1 en claro; aquí va suave como success/warning (≥7:1). */}
        <Badge
          variant={status.variant}
          className={`shrink-0 font-normal ${
            status.variant === "destructive"
              ? "bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-700/30 dark:text-red-100"
              : ""
          }`}
        >
          {status.label}
        </Badge>
      </div>
      <dl className="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-300">
        <div className="flex gap-1.5">
          <dt className="shrink-0 text-gray-500 dark:text-gray-400">Destino</dt>
          <dd className="min-w-0 break-words">{describeCampaignTarget(c, stages, pipelines)}</dd>
        </div>
        {c.voice_agents?.name && (
          <div className="flex gap-1.5">
            <dt className="shrink-0 text-gray-500 dark:text-gray-400">Agente</dt>
            <dd className="min-w-0 truncate">{c.voice_agents.name}</dd>
          </div>
        )}
        <div className="flex gap-1.5">
          <dt className="shrink-0 text-gray-500 dark:text-gray-400">Topes</dt>
          <dd>
            {c.max_calls_per_day}/día · {c.max_calls_per_hour}/hora · {c.max_concurrent} a la vez
          </dd>
        </div>
      </dl>
      {status.detail && (
        <p className="mt-2 break-words text-xs text-red-700 dark:text-red-300" role="status">
          {status.detail}
        </p>
      )}
      <div className="mt-3">
        {canActivate ? (
          <Button
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={busy}
            onClick={() => onActivate(c)}
          >
            {busy ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="mr-1 h-4 w-4" aria-hidden="true" />
            )}
            Activar
          </Button>
        ) : (
          <Button
            size="sm"
            variant="destructive"
            className="w-full sm:w-auto"
            disabled={busy}
            onClick={() => onStop(c)}
          >
            {busy ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <OctagonX className="mr-1 h-4 w-4" aria-hidden="true" />
            )}
            Parada de emergencia
          </Button>
        )}
      </div>
    </li>
  );
}
