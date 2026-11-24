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
  // Píldoras del Figma (1672:127218): hecho con ✓ en verde, actual en marca y
  // pendiente neutro; «Paso N de 4» al final.
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label={t("cloneStepIndicator.pasosClonarVoz")}>
        {([1, 2, 3, 4] as CloneStep[]).map((n) => {
          const state = n < step ? "done" : n === step ? "current" : "todo";
          return (
            <li
              key={n}
              aria-current={state === "current" ? "step" : undefined}
              className={`flex h-7 items-center gap-1.5 rounded-full border px-2.5 ${
                state === "current" ? "border-line-brand bg-brand-tint font-medium text-brand-deep" : "border-line bg-surface text-fg-secondary"
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex size-[18px] items-center justify-center rounded-full text-[11px] font-semibold ${
                  state === "done" ? "text-success-text" : state === "current" ? "bg-brand text-fg-on-brand" : "bg-subtle text-fg-secondary"
                }`}
              >
                {state === "done" ? "✓" : n}
              </span>
              {t(`cloneStepIndicator.titulos.${n}`)}
              <span className="sr-only">{state === "done" ? t("cloneStepIndicator.completado") : state === "current" ? t("cloneStepIndicator.pasoActual") : ""}</span>
            </li>
          );
        })}
      </ol>
      <span className="text-xs text-fg-muted">{t("cloneStepIndicator.pasoDe", { n: step, total: 4 })}</span>
    </div>
  );
}
