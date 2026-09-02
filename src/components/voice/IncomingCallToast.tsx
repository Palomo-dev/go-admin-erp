'use client';

/**
 * IncomingCallToast — Notificación flotante para llamadas entrantes.
 * GO Admin ERP — Fase 3 (Telefonía CRM)
 *
 * Se muestra cuando hay una llamada entrante pendiente (hasIncoming=true).
 * Permite aceptar o rechazar la llamada.
 *
 * Debe usarse dentro de <SoftphoneProvider>.
 */

import { PhoneIncoming, Phone, PhoneOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSoftphone } from './SoftphoneProvider';

export function IncomingCallToast() {
  const { hasIncoming, acceptIncoming, rejectIncoming, callStatus } = useSoftphone();

  if (!hasIncoming || callStatus !== 'connecting') return null;

  return (
    <div className="fixed top-4 right-4 z-[60] animate-in slide-in-from-top-5 duration-300">
      <div className="w-80 rounded-xl border border-yellow-300 dark:border-yellow-700 bg-white dark:bg-gray-800 shadow-2xl overflow-hidden">
        {/* Barra superior animada */}
        <div className="h-1 bg-yellow-500 animate-pulse" />

        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30">
              <PhoneIncoming size={20} className="text-yellow-600 dark:text-yellow-400 animate-bounce" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Llamada entrante
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Tienes una llamada esperando…
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={acceptIncoming}
              size="sm"
              className="flex-1 bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
            >
              <Phone size={14} className="mr-1.5" />
              Aceptar
            </Button>
            <Button
              onClick={rejectIncoming}
              size="sm"
              variant="destructive"
              className="flex-1"
            >
              <PhoneOff size={14} className="mr-1.5" />
              Rechazar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
