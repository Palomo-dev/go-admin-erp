"use client";

/**
 * Selector pipeline → etapa para el destino de una campaña (UXM-D). Sustituye
 * al «ID de la etapa (opcional)» escrito a mano. Si el lookup sabe contar,
 * muestra cuántas oportunidades abiertas tiene la etapa; si no, no inventa.
 */

import React, { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { CrmLookupsState } from "@/components/crm/shared/useCrmLookups";
import { targetStagesOf } from "./campaignModel";
import { useTranslations } from "next-intl";

const NONE = "__none__";

interface Props {
  lookups: CrmLookupsState;
  pipelineId: string | null;
  stageId: string | null;
  onChange: (next: { pipelineId: string | null; stageId: string | null }) => void;
}

export function CampaignTargetPicker({ lookups, pipelineId, stageId, onChange }: Props) {
  const t = useTranslations("crm.agentesIa");
  const { pipelines, stages, loading, error, countOpenOpportunities } = lookups;
  const stageOptions = targetStagesOf(stages, pipelineId);
  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);

  useEffect(() => {
    if (!stageId || !countOpenOpportunities) {
      setCount(null);
      return;
    }
    let alive = true;
    setCounting(true);
    countOpenOpportunities(stageId)
      .then((n) => {
        if (alive) setCount(n);
      })
      .catch(() => {
        if (alive) setCount(null);
      })
      .finally(() => {
        if (alive) setCounting(false);
      });
    return () => {
      alive = false;
    };
  }, [stageId, countOpenOpportunities]);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        {t("campaignTargetPicker.cargandoEmbudos")}
      </p>
    );
  }
  if (error) {
    return (
      <p role="status" className="text-xs text-amber-800 dark:text-amber-200">
        {t("campaignTargetPicker.noPudieronLeerEmbudos", { error })}
      </p>
    );
  }
  if (pipelines.length === 0) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {t("campaignTargetPicker.noHayEmbudosEsta")}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="c-pipeline">{t("editor.etapas.embudo")}</Label>
        <Select
          value={pipelineId ?? NONE}
          onValueChange={(v) => onChange({ pipelineId: v === NONE ? null : v, stageId: null })}
        >
          <SelectTrigger id="c-pipeline" className="[&>span]:line-clamp-1">
            <SelectValue placeholder={t("campaignTargetPicker.eligeEmbudo")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t("campaignTargetPicker.sinEmbudoListaManual")}</SelectItem>
            {pipelines.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="c-stage">{t("campaignTargetPicker.etapaLlamar")}</Label>
        <Select
          value={stageId ?? NONE}
          disabled={!pipelineId}
          onValueChange={(v) => onChange({ pipelineId, stageId: v === NONE ? null : v })}
        >
          {/* Tester UXM-D: una etapa larga se pintaba en 3 líneas fuera de un trigger de 40 px. */}
          <SelectTrigger id="c-stage" aria-describedby="c-stage-help" className="[&>span]:line-clamp-1">
            <SelectValue placeholder={pipelineId ? t("campaignTargetPicker.eligeEtapa") : t("campaignTargetPicker.primeroEligeEmbudo")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t("campaignTargetPicker.ningunaListaManual")}</SelectItem>
            {stageOptions.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p
          id="c-stage-help"
          className="text-xs text-gray-500 dark:text-gray-400"
          aria-live="polite"
        >
          {!stageId
            ? t("campaignTargetPicker.agenteLlamaraOportunidadesAbiertas")
            : counting
              ? t("campaignTargetPicker.contandoOportunidadesAbiertas")
              : count === null
                ? t("campaignTargetPicker.agenteLlamaraOportunidadesAbiertas")
                : t("campaignTargetPicker.oportunidadesAbiertasEtapa", { n: count })}
        </p>
      </div>
    </div>
  );
}
