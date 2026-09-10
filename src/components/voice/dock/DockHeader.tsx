'use client';

/**
 * DockHeader — cabecera del SoftphoneDock: estado del dispositivo con motivo,
 * chip de llamada y minimizar (FASE-03 §5.2).
 */

import Link from 'next/link';
import { Minus, PhoneCall, RefreshCw, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import type { CallStatus, DeviceState } from '../SoftphoneProvider';
import { VOICE_CREDENTIAL_LABELS } from '../hooks/useTwilioDevice';

/**
 * Pantalla donde un administrador guarda las credenciales de voz PROPIAS de su
 * organización: Configuración › CRM › Proveedores e IA.
 *
 * Solo se enlaza cuando el ámbito del 409 es `organization`, es decir, cuando
 * la organización eligió traer sus propias llaves y le faltan. Con el ámbito
 * `platform` —el valor por defecto, cuenta maestra de la plataforma— NO se
 * muestra ni el enlace, ni el proveedor, ni ninguna variable: eso lo conecta
 * el dueño de la plataforma y la organización cliente no puede hacer nada con
 * esa información. Mostrárselo era un error de audiencia (captura del dueño,
 * 2026-09-10).
 */
export const VOICE_PROVIDERS_SETTINGS_HREF = '/app/configuracion?modulo=crm&tab=proveedores';

export const CALL_STATUS_LABELS: Record<CallStatus, string> = {
  idle: 'Inactivo',
  connecting: 'Llamando…',
  ringing: 'Timbrando…',
  connected: 'En llamada',
  ended: 'Finalizada',
};

const CALL_STATUS_VARIANTS: Record<CallStatus, 'secondary' | 'warning' | 'success' | 'destructive'> = {
  idle: 'secondary',
  connecting: 'warning',
  ringing: 'warning',
  connected: 'success',
  ended: 'destructive',
};

export const DEVICE_LABELS: Record<DeviceState, string> = {
  idle: 'Iniciando…',
  unregistered: 'Desconectado',
  registering: 'Conectando…',
  registered: 'Listo',
  error: 'Error',
  no_permission: 'Sin micrófono',
  not_configured: 'Telefonía no configurada',
};

interface DockHeaderProps {
  deviceState: DeviceState;
  deviceReason: string | null;
  /** Nombres (no valores) de las credenciales que faltan. */
  deviceMissing?: string[];
  deviceScope?: 'platform' | 'organization';
  callStatus: CallStatus;
  isAdmin?: boolean;
  onMinimize: () => void;
  onRetry: () => void;
}

export function DockHeader({ deviceState, deviceReason, deviceMissing, deviceScope, callStatus, isAdmin, onMinimize, onRetry }: DockHeaderProps) {
  const missing = deviceMissing ?? [];
  // Solo cuando las llaves son de la propia organización tiene sentido decirle
  // a alguien qué falta y dónde ponerlo.
  const configurableAqui = deviceState === 'not_configured' && deviceScope === 'organization';
  const dotClass =
    deviceState === 'registered'
      ? 'bg-green-500'
      : deviceState === 'registering' || deviceState === 'idle'
        ? 'bg-yellow-500 animate-pulse'
        : deviceState === 'not_configured' || deviceState === 'unregistered'
          ? 'bg-gray-400'
          : 'bg-red-500';

  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative shrink-0">
            <PhoneCall size={18} className="text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <span className={cn('absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full', dotClass)} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">Softphone</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate" aria-live="polite">
              {DEVICE_LABELS[deviceState]}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {callStatus !== 'idle' && (
            <Badge variant={CALL_STATUS_VARIANTS[callStatus]} className="text-[10px]" aria-live="assertive">
              {CALL_STATUS_LABELS[callStatus]}
            </Badge>
          )}
          <button
            type="button"
            onClick={onMinimize}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
            aria-label="Minimizar softphone"
          >
            <Minus size={14} />
          </button>
        </div>
      </div>

      {(deviceState === 'error' || deviceState === 'no_permission' || deviceState === 'not_configured' || deviceState === 'unregistered') && (
        <div
          className={cn(
            'px-3 pb-2 text-xs',
            deviceState === 'not_configured' || deviceState === 'unregistered' ? 'text-gray-600 dark:text-gray-300' : 'text-red-700 dark:text-red-300'
          )}
          role="status"
        >
          <p>{deviceReason ?? DEVICE_LABELS[deviceState]}</p>

          {configurableAqui && missing.length > 0 && (
            <>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {missing.map((key) => (
                  <li key={key}>
                    {VOICE_CREDENTIAL_LABELS[key] ?? key} <code className="text-[10px] opacity-70">{key}</code>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                {/* Sin `isAdmin` no se puede afirmar que quien lee pueda guardarlas:
                    el texto por defecto vale para ambos y no promete permisos. */}
                {isAdmin === false
                  ? 'Pídele a un administrador de tu organización que las guarde en Configuración › CRM › Proveedores e IA.'
                  : 'Se guardan en Configuración › CRM › Proveedores e IA. Cuando estén, vuelve aquí y pulsa Reintentar.'}
              </p>
            </>
          )}

          <div className="mt-1.5 flex items-center gap-3">
            {configurableAqui && (
              <Link
                href={VOICE_PROVIDERS_SETTINGS_HREF}
                className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
              >
                <Settings size={12} aria-hidden="true" />
                Abrir Proveedores e IA
              </Link>
            )}
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 text-gray-600 hover:underline dark:text-gray-300">
              <RefreshCw size={12} aria-hidden="true" />
              Reintentar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
