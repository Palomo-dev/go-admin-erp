"use client";

import { useRedText } from "@/components/crm/red/useRedText";

/**
 * «Pedir referido»: tareas `type='referido'` abiertas que F10 crea al ganar
 * una oportunidad. Cada una abre el registro con el cliente ganado ya
 * elegido como referidor. Si no hay ninguna, la sección no aparece: no se
 * inventa un «no hay datos».
 */

import { HandHeart, Plus, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/crm/red/RedButton";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import type { ReferralRequest } from "@/lib/services/crm/referralsService";

interface Props {
  requests: ReferralRequest[];
  onRegisterFor: (
    request: ReferralRequest,
    trigger: HTMLElement | null,
  ) => void;
}

export function requestButtonId(requestId: string): string {
  return `referral-request-${requestId}`;
}

export function ReferralRequestsSection({ requests, onRegisterFor }: Props) {
  const { tr } = useRedText();
  const [expanded, setExpanded] = useState(false);
  const { formatDate } = useFormatDate();
  if (requests.length === 0) return null;
  return (
    <section
      aria-labelledby="referral-requests-title"
      className="rounded-lg border border-line bg-subtle p-3"
    >
      <div className="flex items-start gap-3">
        <HandHeart
          className="mt-0.5 h-5 w-5 shrink-0 text-brand-deep"
          aria-hidden="true"
        />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <h2
            id="referral-requests-title"
            className="text-sm font-medium text-fg"
          >
            {tr("Solicitudes pendientes: {count}", {
              count: requests.length,
            })}{" "}
          </h2>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            aria-expanded={expanded}
            aria-controls="referral-requests-list"
            onClick={() => setExpanded((v) => !v)}
          >
            {tr("Ver solicitudes")}
            <ChevronDown className={`size-4 ${expanded ? "rotate-180" : ""}`} />
          </Button>
          {expanded && (
            <ul
              id="referral-requests-list"
              className="mt-2 grid w-full gap-2 sm:grid-cols-2 xl:grid-cols-3"
              aria-label={tr("Clientes a los que pedir referido")}
            >
              {requests.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 "
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg ">
                      {r.customer?.full_name ?? r.title}
                    </p>
                    <p className="truncate text-xs text-fg-secondary ">
                      {r.due_date
                        ? tr("Vence el {p0}", { p0: formatDate(r.due_date) })
                        : tr("Sin fecha")}
                    </p>
                  </div>
                  <Button
                    id={requestButtonId(r.id)}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={!r.customer}
                    aria-label={tr("Registrar referido de {p0}", {
                      p0: r.customer?.full_name ?? r.title,
                    })}
                    onClick={(e) => onRegisterFor(r, e.currentTarget)}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />{" "}
                    {tr("Registrar")}{" "}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
