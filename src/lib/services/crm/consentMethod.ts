/**
 * consentMethod — lectura pura de `call_consents.method` (F-4, ronda 8 de voz).
 *
 * Sin `'use client'`, sin JSX y sin cliente Supabase: lo importan tanto el
 * distintivo de la UI (`components/voice/ConsentBadge.tsx`) como las pruebas
 * de Node, que no compilan JSX. El literal vive en UNA sola parte
 * (`consentService.UNVERIFIED_CONSENT_METHOD`); aquí no se duplica.
 */

import { UNVERIFIED_CONSENT_METHOD } from './consentService';

/**
 * `true` si la acta de grabación es `unverified_announcement`: la grabación
 * EXISTE (Twilio la entregó) pero no consta que el aviso de la Ley 1581
 * sonara. La UI la marca con icono + texto («Aviso no acreditado»).
 */
export function isUnverifiedConsent(method: string | null | undefined): boolean {
  return method === UNVERIFIED_CONSENT_METHOD;
}
