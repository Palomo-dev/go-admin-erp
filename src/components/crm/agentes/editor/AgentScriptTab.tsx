"use client";

/**
 * Pestaña «Guion» del editor de agente (UXM-D): primera frase, cómo se
 * identifica como IA e instrucciones. Los guardarraíles no son configurables.
 */

import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ShieldCheck } from "lucide-react";
import type { AgentFormState } from "./useAgentForm";

interface Props {
  form: AgentFormState;
  patch: (partial: Partial<AgentFormState>) => void;
}

export function AgentScriptTab({ form, patch }: Props) {
  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-100">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Sea cual sea este guion, el agente siempre se identifica como asistente virtual, avisa de
          la grabación, respeta la baja voluntaria y no cierra ventas por su cuenta.
        </span>
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="ag-first">Primera frase</Label>
        <Textarea
          id="ag-first"
          rows={2}
          value={form.first_message}
          onChange={(e) => patch({ first_message: e.target.value })}
          placeholder="Le llamo de {{org}} por su solicitud. ¿Tiene un minuto?"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ag-identity">Cómo se identifica como IA</Label>
        <Input
          id="ag-identity"
          value={form.identity_disclosure}
          onChange={(e) => patch({ identity_disclosure: e.target.value })}
          placeholder="Le atiende un asistente virtual con inteligencia artificial."
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ag-prompt">Instrucciones del agente</Label>
        <Textarea
          id="ag-prompt"
          rows={6}
          value={form.system_prompt}
          onChange={(e) => patch({ system_prompt: e.target.value })}
        />
      </div>
    </div>
  );
}
