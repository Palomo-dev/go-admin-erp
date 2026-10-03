"use client";
import { useState } from "react";
import { Plus, UserPlus } from "lucide-react";
import { Button } from "../red/RedButton";
import { useRedText } from "../red/useRedText";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import type { ReferralRequest } from "@/lib/services/crm/referralsService";
export function requestButtonId(id: string) {
  return `referral-request-${id}`;
}
export function ReferralRequestsSection({
  requests,
  onRegisterFor,
}: {
  requests: ReferralRequest[];
  onRegisterFor: (r: ReferralRequest, trigger: HTMLElement | null) => void;
}) {
  const { tr } = useRedText();
  const { formatDate } = useFormatDate();
  const [expanded, setExpanded] = useState(false);
  if (!requests.length) return null;
  return (
    <section
      aria-labelledby="referral-requests-title"
      className="rounded-xl border border-line bg-surface p-3"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-info-subtle text-info-text">
          <UserPlus className="size-4" strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="referral-requests-title"
            className="text-sm font-medium text-fg"
          >
            {tr("{count} clientes esperan que les pidas un referido", {
              count: requests.length,
            })}
          </h2>
          <p className="mt-0.5 text-xs text-fg-muted">
            {tr("Tareas «pedir referido» abiertas")}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          aria-expanded={expanded}
          aria-controls="referral-requests-list"
          onClick={() => setExpanded((v) => !v)}
        >
          {tr("Ver solicitudes")}
        </Button>
      </div>
      {expanded && (
        <ul
          id="referral-requests-list"
          className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
          aria-label={tr("Clientes a los que pedir referido")}
        >
          {requests.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {r.customer?.full_name ?? r.title}
                </p>
                <p className="mt-0.5 text-xs text-fg-secondary">
                  {r.due_date
                    ? tr("Vence el {p0}", { p0: formatDate(r.due_date) })
                    : tr("Sin fecha")}
                </p>
              </div>
              <Button
                id={requestButtonId(r.id)}
                size="sm"
                variant="outline"
                disabled={!r.customer}
                aria-label={tr("Registrar referido de {p0}", {
                  p0: r.customer?.full_name ?? r.title,
                })}
                onClick={(e) => onRegisterFor(r, e.currentTarget)}
              >
                <Plus className="size-4" />
                {tr("Registrar")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
