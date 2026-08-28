'use client';

/**
 * Banner de autorizacion antes de conectar un banco.
 * Muestra el consentimiento explicito requerido por el Decreto 0368 de 2026.
 */

import React, { useState } from 'react';
import { Shield, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';

/** Props del banner de consentimiento */
export interface ConsentBannerProps {
  institutionName: string;
  onAccept: () => void;
  onDecline: () => void;
}

/** Duracion del consentimiento en dias (informativo) */
const CONSENT_DURATION_DAYS = 90;

export function ConsentBanner({ institutionName, onAccept, onDecline }: ConsentBannerProps) {
  const [accepted, setAccepted] = useState(false);

  return (
    <Alert variant="info" className="space-y-4">
      <Shield className="h-5 w-5" />
      <AlertTitle className="text-base">
        Autorizacion de acceso a datos financieros
      </AlertTitle>
      <AlertDescription className="space-y-4 text-sm">
        <p>
          Autorizas a GO Admin ERP a acceder a tus datos de{' '}
          <strong>{institutionName}</strong> durante{' '}
          {CONSENT_DURATION_DAYS} dias para conciliacion bancaria.
          Podras revocar este consentimiento en cualquier momento desde
          la seccion de Open Finance.
        </p>

        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox
            checked={accepted}
            onCheckedChange={(value) => setAccepted(value === true)}
            className="mt-0.5"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            He leido y acepto los terminos de autorizacion y la{' '}
            <a
              href="/politica-privacidad"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 underline inline-flex items-center gap-1"
            >
              politica de privacidad
              <ExternalLink className="h-3 w-3" />
            </a>
          </span>
        </label>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onDecline} type="button">
            Cancelar
          </Button>
          <Button
            onClick={onAccept}
            disabled={!accepted}
            type="button"
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Aceptar
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
