"use client";

/**
 * Paso 1 de «Clonar mi voz»: qué se va a hacer y consentimiento explícito
 * (Habeas Data, Ley 1581 de 2012; política de ElevenLabs). La aceptación se
 * guarda como evidencia en `voices.consent_evidence` (huella del texto, momento
 * y usuario), no el texto ni el audio.
 */

import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Clock3, FileAudio, ShieldCheck, Sparkles } from "lucide-react";
import { HABEAS_DATA_TEXT, estimateReadingSeconds, CLONE_SCRIPT_ES } from "@/lib/services/crm/voiceCloneScript";

interface Props {
  consent: boolean;
  onConsentChange: (value: boolean) => void;
  errorId?: string;
  error?: string | null;
  /** La casilla: el asistente la enfoca cuando falta el consentimiento (R10). */
  checkboxRef?: React.Ref<HTMLButtonElement>;
}

const STEPS = [
  { icon: FileAudio, text: "Lees en voz alta un guion corto que verás en pantalla; se graba aquí mismo." },
  { icon: Sparkles, text: "La grabación viaja a ElevenLabs, que crea una réplica de tu voz en unos segundos." },
  { icon: Clock3, text: `Tarda menos de ${Math.ceil(estimateReadingSeconds(CLONE_SCRIPT_ES) / 60) + 1} minutos. El audio no se guarda en esta plataforma.` },
];

export function CloneStepConsent({ consent, onConsentChange, errorId = "clone-consent-error", error, checkboxRef }: Props) {
  return (
    <div className="space-y-5">
      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map(({ icon: Icon, text }, i) => (
          <li key={i} className="flex gap-3 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-gray-700 dark:text-gray-200">{text}</span>
          </li>
        ))}
      </ol>

      <section
        aria-labelledby="habeas-title"
        className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950"
      >
        <h3 id="habeas-title" className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-100">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Consentimiento para clonar una voz (Habeas Data)
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-amber-900 dark:text-amber-100">{HABEAS_DATA_TEXT}</p>

        <div className="mt-4 flex items-start gap-3">
          <Checkbox
            id="clone-consent"
            ref={checkboxRef}
            checked={consent}
            onCheckedChange={(v) => onConsentChange(v === true)}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? true : undefined}
            className="mt-0.5"
          />
          <Label htmlFor="clone-consent" className="cursor-pointer text-sm font-medium leading-snug text-amber-900 dark:text-amber-100">
            He leído el texto anterior y confirmo que la voz que voy a grabar es la mía o cuento con el
            consentimiento por escrito de su propietario.
          </Label>
        </div>
        {error && (
          <p id={errorId} role="alert" className="mt-2 text-xs font-medium text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
