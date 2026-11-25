'use client';

/**
 * Badge de estado de un referido (Figma «Referidos/Listo»: Pendiente gris,
 * Contactado azul, Calificado ámbar, Convertido verde, Rechazado rojo). Lo
 * usan la pantalla y la tarjeta de configuración del CRM. Texto traducido
 * (`crm.redReferidos.estado`), tono del kit; nunca solo color.
 */

import { useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/kit/StatusBadge';
import type { ReferralStatus } from '@/lib/services/crm/referralStateMachine';
import { TONO_ESTADO } from './referidosLogica';

export function ReferralStatusBadge({ status, className }: { status: ReferralStatus; className?: string }) {
  const t = useTranslations('crm.redReferidos.estado');
  const tono = TONO_ESTADO[status] ?? 'neutro';
  return <StatusBadge estado={status} etiqueta={t(status in TONO_ESTADO ? status : 'pending')} tono={tono} apariencia="suave" className={className} />;
}
