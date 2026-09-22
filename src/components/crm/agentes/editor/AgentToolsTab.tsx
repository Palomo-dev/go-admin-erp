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

const TOOL_LABELS: Record<string, string> = {
  get_customer_context: "Consultar la ficha del cliente",
  move_opportunity_stage: "Mover de etapa (no puede cerrar)",
  update_opportunity_field: "Actualizar datos de la oportunidad",
  create_task: "Crear tarea de seguimiento",
  book_meeting: "Agendar reunión",
  schedule_callback: "Programar devolución de llamada",
  log_objection: "Registrar objeción",
  send_payment_link: "Preparar enlace de pago",
  log_consent_opt_out: "Registrar baja voluntaria",
  transfer_to_human: "Transferir a una persona",
  end_call: "Terminar la llamada",
};

interface Props {
  form: AgentFormState;
  patch: (partial: Partial<AgentFormState>) => void;
}

export function AgentToolsTab({ form, patch }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Qué puede hacer el agente durante la llamada. Cada etapa del embudo puede acotar más esta
        lista.
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
                {TOOL_LABELS[tool] ?? tool}
              </Label>
              {obligatoria && (
                <span
                  id={`tool-${tool}-obligatoria`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                >
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  Obligatoria por ley
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Registrar un «no me vuelva a llamar» y poder colgar son obligatorias (Ley 1581 de 2012). No
        se pueden desactivar ni acotar desde la etapa del embudo.
      </p>
    </div>
  );
}
