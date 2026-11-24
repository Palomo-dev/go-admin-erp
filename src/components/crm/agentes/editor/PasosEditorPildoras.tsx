"use client";

/**
 * Pasos del editor de agente como píldoras (Figma CRM 1313:773321 → 1318:775924):
 * «① Propósito e identidad · ② Guion por etapas · … · Paso N de 5». Hecho con ✓,
 * actual en marca, pendiente neutro. Cada píldora lleva al paso (la regla de
 * salida del paso 1 la aplica `onIr`). En el celular se usa el `Stepper` del
 * kit en segmentos, que cabe a 390 px.
 */

import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/utils/Utils";

interface Props<V extends string> {
  pasos: readonly { valor: V; etiqueta: string }[];
  actual: V;
  etiqueta: string;
  resumen: string;
  onIr: (paso: V) => void;
  className?: string;
}

export function PasosEditorPildoras<V extends string>({ pasos, actual, etiqueta, resumen, onIr, className }: Props<V>) {
  const indiceActual = pasos.findIndex((p) => p.valor === actual);
  return (
    <nav aria-label={etiqueta} className={cn("flex flex-wrap items-center gap-2", className)}>
      <ol className="flex flex-wrap items-center gap-2">
        {pasos.map((p, i) => {
          const estado = i < indiceActual ? "hecho" : i === indiceActual ? "actual" : "pendiente";
          return (
            <li key={p.valor}>
              <button
                type="button"
                onClick={() => onIr(p.valor)}
                aria-current={estado === "actual" ? "step" : undefined}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  estado === "actual" ? "border-line-brand bg-brand-tint font-medium text-brand-deep" : "border-line bg-surface text-fg hover:bg-hover",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-xs font-semibold",
                    estado === "hecho" ? "text-success-text" : estado === "actual" ? "bg-brand text-fg-on-brand" : "bg-subtle text-fg-secondary",
                  )}
                >
                  {estado === "hecho" ? <Check className="size-3.5" strokeWidth={2} /> : i + 1}
                </span>
                {p.etiqueta}
              </button>
            </li>
          );
        })}
      </ol>
      <span className="text-[13px] text-fg-secondary">{resumen}</span>
    </nav>
  );
}
