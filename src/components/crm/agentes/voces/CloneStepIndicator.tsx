"use client";

/**
 * Indicador de los cuatro pasos de «Clonar mi voz»: hecho / actual / pendiente,
 * con `aria-current="step"` y el estado también en texto para lectores de pantalla.
 */

import React from "react";
import { useTranslations } from "next-intl";

export type CloneStep = 1 | 2 | 3 | 4;

export function CloneStepIndicator({ step }: { step: CloneStep }) {
  const t = useTranslations("crm.agentesIa");
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label={t("cloneStepIndicator.pasosClonarVoz")}>
      {([1, 2, 3, 4] as CloneStep[]).map((n) => {
        const state = n < step ? "done" : n === step ? "current" : "todo";
        return (
          <li key={n} className="flex items-center gap-2" aria-current={state === "current" ? "step" : undefined}>
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                state === "done" ? "bg-green-600 text-white" : state === "current" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
              }`}
              aria-hidden="true"
            >
              {state === "done" ? "✓" : n}
            </span>
            <span className={state === "current" ? "font-semibold text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"}>
              {t(`cloneStepIndicator.titulos.${n}`)}
              <span className="sr-only">{state === "done" ? t("cloneStepIndicator.completado") : state === "current" ? t("cloneStepIndicator.pasoActual") : ""}</span>
            </span>
            {n < 4 && <span className="hidden h-px w-6 bg-gray-300 sm:block dark:bg-gray-600" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
