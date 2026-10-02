'use client';
import {StatusBadge} from '@/components/kit/StatusBadge';
import {useRedText} from '@/components/crm/red/useRedText';

/** Estados de comisión y tipos de deal para la interfaz: icono + texto, AA en ambos temas. */

import { BadgeCheck, CircleDashed, Coins, XCircle, type LucideIcon } from 'lucide-react';
import { COMMISSION_STATUS_LABELS, DEAL_TYPE_LABELS, type CommissionStatus, type DealType } from '@/lib/services/crm/partnerCommission';

interface Meta {
  label: string;
  icon: LucideIcon;
  badge: string;
  /** Verbo del botón que lleva A este estado. */
  action: string;
}

export const COMMISSION_META: Record<CommissionStatus, Meta> = {
  pending: { label: COMMISSION_STATUS_LABELS.pending, icon: CircleDashed, badge: 'bg-subtle text-fg  ', action: 'Pendiente' },
  approved: { label: COMMISSION_STATUS_LABELS.approved, icon: BadgeCheck, badge: 'bg-brand-subtle text-brand-deep  ', action: 'Aprobar' },
  paid: { label: COMMISSION_STATUS_LABELS.paid, icon: Coins, badge: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-200', action: 'Registrar pago' },
  rejected: { label: COMMISSION_STATUS_LABELS.rejected, icon: XCircle, badge: 'bg-red-100 text-red-900 dark:bg-red-950/70 dark:text-red-200', action: 'Rechazar' },
};

export function CommissionStatusBadge({ status }: { status: CommissionStatus }) {
  const {tr} = useRedText();
  const meta = COMMISSION_META[status] ?? COMMISSION_META.pending;
  return <StatusBadge estado={status} etiqueta={tr(meta.label)} tono={status === 'paid' ? 'exito' : status === 'rejected' ? 'peligro' : status === 'approved' ? 'marca' : 'neutro'} icono={meta.icon}/>;
}

export function dealTypeLabel(type: DealType | string): string {
  return (DEAL_TYPE_LABELS as Record<string, string>)[type] ?? type;
}
