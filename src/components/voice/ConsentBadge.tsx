'use client';

/**
 * UnverifiedConsentBadge — distintivo «Aviso no acreditado» (F-4, ronda 7 de voz).
 *
 * Una grabación con acta `unverified_announcement` EXISTE (Twilio la entregó)
 * pero no consta que el aviso de la Ley 1581 sonara: el whisper/`<Say>` no se
 * pudo acreditar. Hasta esta ronda se reproducía exactamente igual que una
 * acreditada, porque ningún componente leía `call_consents.method`. Se marca
 * con icono + texto (nunca solo color) allí donde se reproduce.
 */

import { ShieldAlert } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { isUnverifiedConsent } from '@/lib/services/crm/consentMethod';

// H-4 (ronda 8): `isUnverifiedConsent` y el literal `unverified_announcement`
// viven en `@/lib/services/crm/consentMethod` (puro, probado en Node); aquí
// solo se reexporta para no romper a `CallPlayer`.
export { isUnverifiedConsent };

export const UNVERIFIED_CONSENT_LABEL = 'Aviso no acreditado';
export const UNVERIFIED_CONSENT_TITLE =
  'La grabación existe, pero no consta que el aviso de grabación (Ley 1581) se reprodujera al interlocutor. Revisa el acta antes de usarla.';

interface UnverifiedConsentBadgeProps {
  method: string | null | undefined;
  /** `compact`: solo icono + texto corto (fila de tabla). `full`: añade la explicación. */
  variant?: 'compact' | 'full';
  className?: string;
}

export function UnverifiedConsentBadge({ method, variant = 'compact', className }: UnverifiedConsentBadgeProps) {
  if (!isUnverifiedConsent(method)) return null;
  return (
    <span
      role="status"
      title={UNVERIFIED_CONSENT_TITLE}
      className={cn(
        'inline-flex items-center gap-1 rounded border border-amber-400 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 dark:border-amber-500 dark:bg-amber-950/60 dark:text-amber-200',
        className
      )}
    >
      <ShieldAlert size={12} aria-hidden="true" />
      <span>{UNVERIFIED_CONSENT_LABEL}</span>
      {variant === 'full' && <span className="font-normal">· {UNVERIFIED_CONSENT_TITLE}</span>}
    </span>
  );
}
