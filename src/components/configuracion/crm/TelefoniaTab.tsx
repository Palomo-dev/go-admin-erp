'use client';

/**
 * TelefoniaTab — Configuración › CRM › Telefonía (FASE-03 §5.2).
 * Secciones: Números (+ caller id), Grabación y consentimiento, Mi celular.
 * Muestra el estado de credenciales (API Key / TwiML App) con enlace a
 * Proveedores e IA cuando falta algo (el dock queda "no configurado" hasta entonces).
 */

import Link from 'next/link';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useTelephonySettings } from './telefonia/useTelephonySettings';
import { PhoneNumbersSection } from './telefonia/PhoneNumbersSection';
import { RecordingConsentSection } from './telefonia/RecordingConsentSection';
import { MyMobileSection } from './telefonia/MyMobileSection';

export function TelefoniaTab() {
  const t = useTelephonySettings();

  if (t.loading && !t.settings) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-gray-500 dark:text-gray-400" role="status">
        <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Cargando telefonía…
      </div>
    );
  }
  if (t.error || !t.settings) {
    return (
      <div className="space-y-3 p-6 text-sm text-red-700 dark:text-red-300" role="alert">
        <p>{t.error ?? 'No se pudo cargar la configuración de telefonía'}</p>
        <Button size="sm" variant="outline" onClick={() => void t.reload()}>
          <RefreshCw size={14} className="mr-1.5" aria-hidden="true" /> Reintentar
        </Button>
      </div>
    );
  }

  const missing: string[] = [];
  if (!t.configured?.account) missing.push('Account SID / Auth Token');
  if (!t.configured?.api_key) missing.push('API Key y Secret');
  if (!t.configured?.twiml_app) missing.push('TwiML App SID');

  return (
    <div className="space-y-6">
      {missing.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-100" role="status">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">El softphone del navegador está deshabilitado: faltan {missing.join(', ')} de Twilio.</p>
            <p className="text-xs">
              Configúralos en{' '}
              <Link href="/app/configuracion?modulo=crm&tab=proveedores" className="underline">
                Proveedores e IA › Telefonía
              </Link>{' '}
              (o en el entorno de la plataforma: TWILIO_API_KEY, TWILIO_API_SECRET, TWILIO_TWIML_APP_SID). La TwiML App debe apuntar a <code>/api/voice/twiml/outbound</code> y su Status Callback a <code>/api/voice/status</code>.
            </p>
          </div>
        </div>
      )}

      <Card className="border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <CardContent className="space-y-8 p-4 sm:p-6">
          <PhoneNumbersSection
            numbers={t.numbers}
            members={t.members}
            settings={t.settings}
            configured={t.configured}
            canEdit={t.canEdit}
            onImport={t.importNumbers}
            onPatchNumber={t.patchNumber}
            onPatchSettings={t.patchSettings}
          />
          <Separator />
          <RecordingConsentSection key={t.settings.organization_id} settings={t.settings} canEdit={t.canEdit} onPatchSettings={t.patchSettings} />
          <Separator />
          <MyMobileSection numbers={t.numbers} />
        </CardContent>
      </Card>
    </div>
  );
}
