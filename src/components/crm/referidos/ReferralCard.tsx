'use client';

/**
 * Tarjeta de un referido (brief §3: tarjetas para catálogos). Estado con
 * icono + texto, referidor con enlace a su ficha, programa y recompensa, y
 * las acciones que la máquina de estados permite desde su estado actual.
 */

import Link from 'next/link';
import { ArrowRight, Gift, Mail, Phone, User, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StaggerItem } from '@/components/shared/motion';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { describeReward } from '@/lib/services/crm/referralReward';
import { nextReferralStatuses } from '@/lib/services/crm/referralStateMachine';
import type { ReferralView } from '@/lib/services/crm/referralsService';
import { REFERRAL_STATUS_META, ReferralStatusBadge } from './referralMeta';

interface Props {
  referral: ReferralView;
  currency: string | null;
  busy: boolean;
  onTransition: (referral: ReferralView, to: 'contacted' | 'qualified') => void;
  onReject: (referral: ReferralView) => void;
  onConvert: (referral: ReferralView) => void;
  onMarkPaid: (referral: ReferralView) => void;
}

export function referralActionId(referralId: string, action: string): string {
  return `referral-${referralId}-${action}`;
}

export function ReferralCard({ referral, currency, busy, onTransition, onReject, onConvert, onMarkPaid }: Props) {
  const { formatDate, formatDateTime } = useFormatDate();
  const next = nextReferralStatuses(referral.status);
  const reward = describeReward(referral.program, currency);
  const canPay = referral.status === 'converted' && !!referral.program_id && !referral.reward_paid;
  const forward = next.find((s) => s === 'contacted' || s === 'qualified') as 'contacted' | 'qualified' | undefined;

  return (
    <StaggerItem as="li" layout className="list-none">
      <article
        aria-labelledby={`referral-${referral.id}-name`}
        className="flex h-full flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
      >
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 id={`referral-${referral.id}-name`} className="truncate font-semibold text-gray-900 dark:text-gray-100">
              {referral.referred_name}
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">Registrado el {formatDate(referral.created_at)}</p>
          </div>
          <ReferralStatusBadge status={referral.status} />
        </header>

        <dl className="grid gap-1.5 text-sm">
          <div className="flex items-center gap-2">
            <dt className="sr-only">Referido por</dt>
            <User className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
            <dd className="truncate text-gray-800 dark:text-gray-200">
              {referral.referrer ? (
                <Link href={`/app/crm/clientes/${referral.referrer.id}`} className="font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-300">
                  {referral.referrer.full_name ?? 'Cliente sin nombre'}
                </Link>
              ) : (
                <span className="text-gray-600 dark:text-gray-400">Referidor no disponible</span>
              )}
            </dd>
          </div>
          {(referral.referred_email || referral.referred_phone) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-700 dark:text-gray-300">
              {referral.referred_email && (
                <span className="inline-flex items-center gap-1.5"><Mail className="h-4 w-4 text-gray-500" aria-hidden="true" /><span className="sr-only">Correo:</span>{referral.referred_email}</span>
              )}
              {referral.referred_phone && (
                <span className="inline-flex items-center gap-1.5"><Phone className="h-4 w-4 text-gray-500" aria-hidden="true" /><span className="sr-only">Teléfono:</span>{referral.referred_phone}</span>
              )}
            </div>
          )}
          <div className="flex items-start gap-2">
            <dt className="sr-only">Programa y recompensa</dt>
            <Gift className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
            <dd className="text-gray-800 dark:text-gray-200">
              {referral.program ? (
                <>
                  <span className="font-medium">{referral.program.name}</span>
                  {reward && <span className="text-gray-600 dark:text-gray-400"> · {reward.summary}</span>}
                  {referral.reward_paid && (
                    <span className="mt-0.5 block text-xs font-medium text-emerald-800 dark:text-emerald-200">Recompensa registrada como pagada el {formatDateTime(referral.reward_paid_at)}</span>
                  )}
                </>
              ) : (
                <span className="text-gray-600 dark:text-gray-400">Sin programa: no hay recompensa que registrar</span>
              )}
            </dd>
          </div>
          {referral.opportunity && (
            <div className="flex items-center gap-2">
              <dt className="sr-only">Lead creado</dt>
              <ArrowRight className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
              <dd>
                <Link href={`/app/crm/oportunidades/${referral.opportunity.id}`} className="text-blue-700 underline-offset-2 hover:underline dark:text-blue-300">
                  {referral.opportunity.name}
                </Link>
              </dd>
            </div>
          )}
        </dl>

        {(next.length > 0 || canPay) && (
          <footer className="mt-auto flex flex-wrap gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
            {forward && (
              <Button id={referralActionId(referral.id, forward)} type="button" size="sm" className="bg-blue-600 text-white hover:bg-blue-700" disabled={busy} onClick={() => onTransition(referral, forward)}>
                {REFERRAL_STATUS_META[forward].action}
              </Button>
            )}
            {next.includes('converted') && (
              <Button id={referralActionId(referral.id, 'converted')} type="button" size="sm" className="bg-blue-600 text-white hover:bg-blue-700" disabled={busy} onClick={() => onConvert(referral)}>
                Convertir en lead
              </Button>
            )}
            {canPay && (
              <Button id={referralActionId(referral.id, 'reward')} type="button" size="sm" variant="outline" disabled={busy} onClick={() => onMarkPaid(referral)}>
                <Gift className="mr-1.5 h-4 w-4" aria-hidden="true" /> Registrar recompensa pagada
              </Button>
            )}
            {next.includes('rejected') && (
              <Button id={referralActionId(referral.id, 'rejected')} type="button" size="sm" variant="ghost" className="text-red-700 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200" disabled={busy} onClick={() => onReject(referral)}>
                <XCircle className="mr-1.5 h-4 w-4" aria-hidden="true" /> Rechazar
              </Button>
            )}
          </footer>
        )}
      </article>
    </StaggerItem>
  );
}
