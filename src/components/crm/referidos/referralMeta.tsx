'use client';
import {useRedText} from '@/components/crm/red/useRedText';

/**
 * Estados de referido para la interfaz: icono + texto + colores AA en claro y
 * oscuro (nunca solo color, brief §2). Las transiciones vienen de la máquina
 * pura; aquí solo se etiquetan.
 */

import { CheckCircle2, CircleDashed, PhoneCall, Star, XCircle, type LucideIcon } from 'lucide-react';
import type { ReferralStatus } from '@/lib/services/crm/referralStateMachine';

export interface StatusMeta {
  label: string;
  icon: LucideIcon;
  /** Clases del badge (fondo + texto), contraste AA medido en el arnés. */
  badge: string;
  /** Verbo del botón que lleva A este estado. */
  action: string;
}

export const REFERRAL_STATUS_META: Record<ReferralStatus, StatusMeta> = {
  pending: {
    label: 'Pendiente',
    icon: CircleDashed,
    badge: 'bg-subtle text-fg  ',
    action: 'Volver a pendiente',
  },
  contacted: {
    label: 'Contactado',
    icon: PhoneCall,
    badge: 'bg-brand-subtle text-brand-deep  ',
    action: 'Marcar contactado',
  },
  qualified: {
    label: 'Calificado',
    icon: Star,
    badge: 'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200',
    action: 'Marcar calificado',
  },
  converted: {
    label: 'Convertido',
    icon: CheckCircle2,
    badge: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-200',
    action: 'Convertir en lead',
  },
  rejected: {
    label: 'Rechazado',
    icon: XCircle,
    badge: 'bg-red-100 text-red-900 dark:bg-red-950/70 dark:text-red-200',
    action: 'Rechazar',
  },
};

export function ReferralStatusBadge({ status }: { status: ReferralStatus }) {
  const {tr} = useRedText();
  const meta = REFERRAL_STATUS_META[status] ?? REFERRAL_STATUS_META.pending;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.badge}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {tr(meta.label)}
    </span>
  );
}
