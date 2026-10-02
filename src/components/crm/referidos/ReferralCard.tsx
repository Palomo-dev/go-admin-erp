'use client';

import {useRedText} from '@/components/crm/red/useRedText';

/**
 * Tarjeta de un referido (brief §3: tarjetas para catálogos). Estado con
 * icono + texto, referidor con enlace a su ficha, programa y recompensa, y
 * las acciones que la máquina de estados permite desde su estado actual.
 */

import Link from 'next/link';
import { ArrowRight, Gift, Mail, Phone, User, XCircle } from 'lucide-react';
import { Button } from '@/components/crm/red/RedButton';
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
  canManage?: boolean;
  canRegister?: boolean;
  onTransition: (referral: ReferralView, to: 'contacted' | 'qualified') => void;
  onReject: (referral: ReferralView) => void;
  onConvert: (referral: ReferralView) => void;
  onMarkPaid: (referral: ReferralView) => void;
}

export function referralActionId(referralId: string, action: string): string {
  return `referral-${referralId}-${action}`;
}

export function ReferralCard({ referral, currency, busy, canManage = true, canRegister = true, onTransition, onReject, onConvert, onMarkPaid }: Props) {
  const {tr, locale} = useRedText();
  const { formatDate, formatDateTime } = useFormatDate();
  const next = nextReferralStatuses(referral.status);
  const reward = describeReward(referral.program, currency, {locale, translate: tr});
  const canPay = referral.status === 'converted' && !!referral.program_id && !referral.reward_paid;
  const forward = next.find((s) => s === 'contacted' || s === 'qualified') as 'contacted' | 'qualified' | undefined;

  return (
    <StaggerItem as="li" layout className="list-none">
      <article
        aria-labelledby={`referral-${referral.id}-name`}
        className="flex h-full flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm  "
      >
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 id={`referral-${referral.id}-name`} className="truncate font-semibold text-fg ">
              {referral.referred_name}
            </h3>
            <p className="text-xs text-fg-secondary ">{tr("Registrado el")} {formatDate(referral.created_at)}</p>
          </div>
          <ReferralStatusBadge status={referral.status} />
        </header>

        <dl className="grid gap-1.5 text-sm">
          <div className="flex items-center gap-2">
            <dt className="sr-only">{tr("Referido por")}</dt>
            <User className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
            <dd className="truncate text-fg ">
              {referral.referrer ? (
                <Link href={`/app/crm/clientes/${referral.referrer.id}`} className="font-medium text-brand-deep underline-offset-2 hover:underline ">
                  {referral.referrer.full_name ?? tr("Cliente sin nombre")}
                </Link>
              ) : (
                <span className="text-fg-secondary ">{tr("Referidor no disponible")}</span>
              )}
            </dd>
          </div>
          {(referral.referred_email || referral.referred_phone) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-fg-secondary ">
              {referral.referred_email && (
                <span className="inline-flex items-center gap-1.5"><Mail className="h-4 w-4 text-fg-muted" aria-hidden="true" /><span className="sr-only">{tr("Correo:")}</span>{referral.referred_email}</span>
              )}
              {referral.referred_phone && (
                <span className="inline-flex items-center gap-1.5"><Phone className="h-4 w-4 text-fg-muted" aria-hidden="true" /><span className="sr-only">{tr("Teléfono:")}</span>{referral.referred_phone}</span>
              )}
            </div>
          )}
          <div className="flex items-start gap-2">
            <dt className="sr-only">{tr("Programa y recompensa")}</dt>
            <Gift className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
            <dd className="text-fg ">
              {referral.program ? (
                <>
                  <span className="font-medium">{referral.program.name}</span>
                  {reward && <span className="text-fg-secondary "> · {reward.summary}</span>}
                  {referral.reward_paid && (
                    <span className="mt-0.5 block text-xs font-medium text-emerald-800 dark:text-emerald-200">{tr("Recompensa registrada como pagada el")} {formatDateTime(referral.reward_paid_at)}</span>
                  )}
                </>
              ) : (
                <span className="text-fg-secondary ">{tr("Sin programa: no hay recompensa que registrar")}</span>
              )}
            </dd>
          </div>
          {referral.opportunity && (
            <div className="flex items-center gap-2">
              <dt className="sr-only">{tr("Lead creado")}</dt>
              <ArrowRight className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
              <dd>
                <Link href={`/app/crm/oportunidades/${referral.opportunity.id}`} className="text-brand-deep underline-offset-2 hover:underline ">
                  {referral.opportunity.name}
                </Link>
              </dd>
            </div>
          )}
        </dl>

        {(next.length > 0 || canPay) && (
          <footer className="mt-auto flex flex-wrap gap-2 border-t border-line pt-3 ">
            {forward && canManage && (
              <Button id={referralActionId(referral.id, forward)} type="button" size="sm" className="" disabled={busy} onClick={() => onTransition(referral, forward)}>
                {tr(REFERRAL_STATUS_META[forward].action)}
              </Button>
            )}
            {next.includes('converted') && canRegister && (
              <Button id={referralActionId(referral.id, 'converted')} type="button" size="sm" className="" disabled={busy} onClick={() => onConvert(referral)}>
                 {tr("Convertir en lead")} </Button>
            )}
            {canPay && canManage && (
              <Button id={referralActionId(referral.id, 'reward')} type="button" size="sm" variant="outline" disabled={busy} onClick={() => onMarkPaid(referral)}>
                <Gift className="h-4 w-4" aria-hidden="true" />  {tr("Registrar recompensa pagada")} </Button>
            )}
            {next.includes('rejected') && canManage && (
              <Button id={referralActionId(referral.id, 'rejected')} type="button" size="sm" variant="ghost" className="text-red-700 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200" disabled={busy} onClick={() => onReject(referral)}>
                <XCircle className="h-4 w-4" aria-hidden="true" />  {tr("Rechazar")} </Button>
            )}
          </footer>
        )}
      </article>
    </StaggerItem>
  );
}
