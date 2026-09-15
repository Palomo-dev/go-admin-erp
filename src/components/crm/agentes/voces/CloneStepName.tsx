"use client";

/**
 * Paso 4 de «Clonar mi voz»: nombre, si será la voz por defecto y resumen.
 */

import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { NAME_MAX } from "@/lib/services/crm/voiceCloneScript";
import { VoiceAvatar } from "./VoiceAvatar";
import { formatClock } from "./cloneSamples";

interface Props {
  name: string;
  onNameChange: (value: string) => void;
  makeDefault: boolean;
  onMakeDefaultChange: (value: boolean) => void;
  /** Resumen de las muestras que se van a enviar. */
  summary: { count: number; durationSeconds: number };
  error?: string | null;
  errorId?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}

export function CloneStepName({ name, onNameChange, makeDefault, onMakeDefaultChange, summary, error, errorId = "clone-name-error", inputRef }: Props) {
  return (
    <div className="mx-auto grid max-w-2xl gap-5 sm:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 p-4 text-center dark:border-gray-700">
        <VoiceAvatar voiceId={name || "nueva-voz"} name={name || "?"} size="lg" />
        <p className="max-w-[10rem] truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{name.trim() || "Tu voz"}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {summary.count === 1 ? "una muestra" : `${summary.count} muestras`} · {formatClock(summary.durationSeconds)} min
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="clone-name">Nombre de la voz</Label>
          <Input
            id="clone-name"
            ref={inputRef}
            value={name}
            maxLength={NAME_MAX}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Por ejemplo: Voz de Camila (ventas)"
            aria-describedby={error ? errorId : "clone-name-help"}
            aria-invalid={error ? true : undefined}
            autoComplete="off"
          />
          {error ? (
            <p id={errorId} role="alert" className="text-xs font-medium text-red-700 dark:text-red-300">{error}</p>
          ) : (
            <p id="clone-name-help" className="text-xs text-gray-500 dark:text-gray-400">
              Así la verás en Mis voces y en el editor de agentes.
            </p>
          )}
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
          <Checkbox id="clone-default" checked={makeDefault} onCheckedChange={(v) => onMakeDefaultChange(v === true)} className="mt-0.5" />
          <Label htmlFor="clone-default" className="cursor-pointer text-sm font-normal leading-snug text-gray-700 dark:text-gray-200">
            Usarla como voz por defecto de la organización (los agentes sin voz propia llamarán con ella).
          </Label>
        </div>
      </div>
    </div>
  );
}
