"use client";

/**
 * Pestaña «Herramientas» del editor de agente (UXM-D). Las obligatorias por ley
 * (registrar baja voluntaria y colgar) van marcadas y bloqueadas.
 */

import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";
import { ALL_TOOL_NAMES } from "@/lib/services/crm/voiceAgentTools";
import { isMandatoryTool, toggleAllowedTool, type AgentFormState } from "./useAgentForm";
import { useTranslations } from "next-intl";


interface Props {
  form: AgentFormState;
  patch: (partial: Partial<AgentFormState>) => void;
}

export function AgentToolsTab({ form, patch }: Props) {
  const t = useTranslations("crm.agentesIa");
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {t("agentToolsTab.puedeHacerAgenteDurante")}
      </p>
      <ul className="space-y-1">
        {ALL_TOOL_NAMES.map((tool) => {
          const obligatoria = isMandatoryTool(tool);
          return (
            <li key={tool} className="flex min-h-11 items-center gap-3 rounded-lg px-1">
              <Checkbox
                id={`tool-${tool}`}
                checked={obligatoria || form.allowed_tools.includes(tool)}
                disabled={obligatoria}
                aria-describedby={obligatoria ? `tool-${tool}-obligatoria` : undefined}
                onCheckedChange={(v) =>
                  patch({ allowed_tools: toggleAllowedTool(form.allowed_tools, tool, v === true) })
                }
              />
              <Label
                htmlFor={`tool-${tool}`}
                className={`min-w-0 flex-1 text-sm font-normal ${
                  obligatoria ? "text-gray-700 dark:text-gray-300" : "cursor-pointer"
                }`}
              >
                {t.has(`agentToolsTab.herramientas.${tool}`) ? t(`agentToolsTab.herramientas.${tool}`) : tool}
              </Label>
              {obligatoria && (
                <span
                  id={`tool-${tool}-obligatoria`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                >
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  {t("agentToolsTab.obligatoriaLey")}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {t("agentToolsTab.registrarNoMeVuelva")}
      </p>
    </div>
  );
}
