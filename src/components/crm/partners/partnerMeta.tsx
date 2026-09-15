'use client';

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
  pending: { label: COMMISSION_STATUS_LABELS.pending, icon: CircleDashed, badge: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200', action: 'Pendiente' },
  approved: { label: COMMISSION_STATUS_LABELS.approved, icon: BadgeCheck, badge: 'bg-blue-100 text-blue-900 dark:bg-blue-950/70 dark:text-blue-200', action: 'Aprobar' },
  paid: { label: COMMISSION_STATUS_LABELS.paid, icon: Coins, badge: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-200', action: 'Registrar pago' },
  rejected: { label: COMMISSION_STATUS_LABELS.rejected, icon: XCircle, badge: 'bg-red-100 text-red-900 dark:bg-red-950/70 dark:text-red-200', action: 'Rechazar' },
};

export function CommissionStatusBadge({ status }: { status: CommissionStatus }) {
  const meta = COMMISSION_META[status] ?? COMMISSION_META.pending;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.badge}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export function dealTypeLabel(type: DealType | string): string {
  return (DEAL_TYPE_LABELS as Record<string, string>)[type] ?? type;
}
