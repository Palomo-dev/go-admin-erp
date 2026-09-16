'use client';

/**
 * «Pedir referido»: tareas `type='referido'` abiertas que F10 crea al ganar
 * una oportunidad. Cada una abre el registro con el cliente ganado ya
 * elegido como referidor. Si no hay ninguna, la sección no aparece: no se
 * inventa un «no hay datos».
 */

import { HandHeart, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { ReferralRequest } from '@/lib/services/crm/referralsService';

interface Props {
  requests: ReferralRequest[];
  onRegisterFor: (request: ReferralRequest, trigger: HTMLElement | null) => void;
}

export function requestButtonId(requestId: string): string {
  return `referral-request-${requestId}`;
}

export function ReferralRequestsSection({ requests, onRegisterFor }: Props) {
  const { formatDate } = useFormatDate();
  if (requests.length === 0) return null;
  return (
    <section aria-labelledby="referral-requests-title" className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
      <div className="flex items-start gap-3">
        <HandHeart className="mt-0.5 h-5 w-5 shrink-0 text-amber-800 dark:text-amber-200" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="referral-requests-title" className="font-semibold text-gray-900 dark:text-gray-100">
            Pedir referido · {requests.length} cliente{requests.length === 1 ? '' : 's'} ganado{requests.length === 1 ? '' : 's'} sin pedir
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">Al ganar una oportunidad queda una tarea de pedir referido. Regístralo aquí con el cliente ya elegido.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="Clientes a los que pedir referido">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-amber-200/80 bg-white px-3 py-2 dark:border-amber-900/50 dark:bg-gray-900">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{r.customer?.full_name ?? r.title}</p>
                  <p className="truncate text-xs text-gray-600 dark:text-gray-400">
                    {r.due_date ? `Vence el ${formatDate(r.due_date)}` : 'Sin fecha'}
                  </p>
                </div>
                <Button
                  id={requestButtonId(r.id)}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={!r.customer}
                  aria-label={`Registrar referido de ${r.customer?.full_name ?? r.title}`}
                  onClick={(e) => onRegisterFor(r, e.currentTarget)}
                >
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Registrar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
