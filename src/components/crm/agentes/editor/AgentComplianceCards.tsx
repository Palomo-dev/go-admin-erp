"use client";

/**
 * «Cumplimiento (lo aplica el sistema, no se desactiva)» del paso 4 del editor
 * (Figma CRM 1316:775504). Informativo: las reglas viven en el servidor
 * (`voiceAgent/ley2300.ts`, `fn_can_contact`, guardarraíles del runtime y
 * `contact_consents`) y aquí solo se explican. No hay nada que activar.
 *
 * Diferencia con el Figma: su tarjeta «RNE» ya no es cierta (desde 26293cde
 * las campañas no exigen la verificación del RNE); va en su lugar la del
 * consentimiento y la baja voluntaria, que sí se comprueba antes de cada llamada.
 */

import React from "react";
import { useTranslations } from "next-intl";
import { Clock, ShieldCheck, UserX } from "lucide-react";

const REGLAS = [
  { clave: "ley2300", icono: Clock },
  { clave: "consentimiento", icono: UserX },
  { clave: "datos", icono: ShieldCheck },
] as const;

export function AgentComplianceCards() {
  const t = useTranslations("crm.agentesIa.editor.cumplimiento");
  return (
    <section aria-labelledby="ag-cumplimiento" className="space-y-2">
      <h3 id="ag-cumplimiento" className="text-sm font-semibold text-fg">
        {t("titulo")}
      </h3>
      <ul className="space-y-2">
        {REGLAS.map(({ clave, icono: Icono }) => (
          <li key={clave} className="flex items-start gap-3 rounded-xl border border-line-success bg-success-subtle p-3">
            <Icono aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success-text" strokeWidth={1.5} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-success-text">{t(`${clave}.titulo`)}</p>
              <p className="text-[13px] text-fg-secondary">{t(`${clave}.descripcion`)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
