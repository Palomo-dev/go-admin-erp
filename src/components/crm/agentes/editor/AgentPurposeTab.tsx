"use client";

/**
 * Pestaña «Propósito» del editor de agente (UXM-D): campos a ancho completo,
 * modelo como selector del catálogo de la organización y los dos topes
 * (turnos / segundos) en una fila con etiquetas cortas y ayuda.
 */

import React, { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles } from "lucide-react";
import { useAgentModels } from "./agentModels";
import type { AgentFormState } from "./useAgentForm";

const PURPOSES: Array<[string, string]> = [
  ["sell_product", "Vender un producto"],
  ["book_meeting", "Agendar una reunión"],
  ["qualify_lead", "Calificar contacto"],
  ["confirm_demo", "Confirmar demo"],
  ["follow_up_proposal", "Seguimiento de propuesta"],
  ["reactivate_cold", "Reactivar contacto frío"],
  ["collect_payment", "Cobro"],
  ["nps_survey", "Encuesta NPS"],
  ["renewal_reminder", "Recordar renovación"],
  ["custom", "Personalizado"],
];

interface Props {
  form: AgentFormState;
  patch: (partial: Partial<AgentFormState>) => void;
  /** Agente nuevo: el modelo vacío se rellena con el recomendado del catálogo. */
  isNew: boolean;
}

export function AgentPurposeTab({ form, patch, isNew }: Props) {
  const models = useAgentModels(form.llm_model);

  useEffect(() => {
    if (isNew && !form.llm_model && models.defaultValue) patch({ llm_model: models.defaultValue });
  }, [isNew, form.llm_model, models.defaultValue, patch]);

  const selected = models.options.find((o) => o.value === form.llm_model);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="ag-name">Nombre</Label>
        <Input
          id="ag-name"
          value={form.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="Ej. Ana, asistente comercial"
          autoComplete="off"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ag-purpose">Propósito</Label>
        <Select value={form.purpose_type} onValueChange={(v) => patch({ purpose_type: v })}>
          <SelectTrigger id="ag-purpose">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PURPOSES.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ag-model">Modelo de lenguaje</Label>
        {models.loading ? (
          <p className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Cargando los modelos disponibles…
          </p>
        ) : models.error || models.options.length === 0 ? (
          <>
            <Input
              id="ag-model"
              value={form.llm_model}
              onChange={(e) => patch({ llm_model: e.target.value })}
              placeholder="Nombre del modelo"
              aria-describedby="ag-model-help"
            />
            <p
              id="ag-model-help"
              role="status"
              className="text-xs text-amber-800 dark:text-amber-200"
            >
              {models.error
                ? `No se pudo leer el catálogo de modelos (${models.error}); escribe el nombre a mano.`
                : "Ningún proveedor de IA tiene credenciales: escribe el nombre a mano o configúralas en Proveedores e IA."}
            </p>
          </>
        ) : (
          <>
            <Select
              value={form.llm_model || undefined}
              onValueChange={(v) => patch({ llm_model: v })}
            >
              <SelectTrigger id="ag-model" aria-describedby="ag-model-help" className="[&>span]:line-clamp-1">
                <SelectValue placeholder="Elige un modelo" />
              </SelectTrigger>
              <SelectContent>
                {models.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    <span className="flex items-center gap-1.5">
                      {o.label}
                      {o.recomendado && (
                        <Sparkles
                          className="h-3 w-3 text-blue-600 dark:text-blue-400"
                          aria-label="Recomendado"
                        />
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id="ag-model-help" className="text-xs text-gray-500 dark:text-gray-400">
              {selected?.hint ??
                "Solo aparecen los modelos de proveedores con credenciales en esta organización."}
            </p>
          </>
        )}
      </div>

      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="mb-1.5 text-sm font-medium text-gray-900 dark:text-gray-100">
          Topes por llamada
        </legend>
        <div className="space-y-1.5">
          <Label htmlFor="ag-turns">Turnos</Label>
          <Input
            id="ag-turns"
            type="number"
            inputMode="numeric"
            min={1}
            value={form.max_turns}
            onChange={(e) => patch({ max_turns: Number(e.target.value) })}
            aria-describedby="ag-turns-help"
          />
          <p id="ag-turns-help" className="text-xs text-gray-500 dark:text-gray-400">
            Intercambios como máximo
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ag-dur">Segundos</Label>
          <Input
            id="ag-dur"
            type="number"
            inputMode="numeric"
            min={30}
            step={30}
            value={form.max_duration_seconds}
            onChange={(e) => patch({ max_duration_seconds: Number(e.target.value) })}
            aria-describedby="ag-dur-help"
          />
          <p id="ag-dur-help" className="text-xs text-gray-500 dark:text-gray-400">
            Duración máxima de la llamada
          </p>
        </div>
      </fieldset>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
        <Label htmlFor="ag-active" className="cursor-pointer text-sm">
          Agente activo
        </Label>
        <Switch
          id="ag-active"
          checked={form.is_active}
          onCheckedChange={(v) => patch({ is_active: v })}
        />
      </div>
    </div>
  );
}
