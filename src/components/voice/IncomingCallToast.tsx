'use client';

/**
 * IncomingCallToast — aviso de llamada entrante (FASE-03 §5.2, §5.6).
 * `role="alertdialog"`, foco inicial en Aceptar, `Esc` rechaza, `Enter` acepta.
 * Muestra quién llama (cliente resuelto por GET /api/crm/calls?provider_call_sid=).
 */

import { useEffect, useRef, useState } from 'react';
import { PhoneIncoming, Phone, PhoneOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSoftphone } from './SoftphoneProvider';

export function IncomingCallToast() {
  const sp = useSoftphone();
  const acceptRef = useRef<HTMLButtonElement | null>(null);
  const [caller, setCaller] = useState<{ name: string | null; opportunity: string | null } | null>(null);

  const incoming = sp.available ? sp.incoming : null;
  const callSid = incoming?.callSid ?? null;

  useEffect(() => {
    if (!incoming) {
      setCaller(null);
      return;
    }
    acceptRef.current?.focus();
    if (!callSid) return;
    let cancelled = false;
    fetch(`/api/crm/calls?provider_call_sid=${encodeURIComponent(callSid)}&limit=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const row = body?.data?.[0];
        if (row && !cancelled) setCaller({ name: row.customer?.full_name ?? null, opportunity: row.opportunity?.name ?? null });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [incoming, callSid]);

  if (!sp.available || !incoming) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[60] animate-in slide-in-from-top-5 duration-300"
      role="alertdialog"
      aria-modal="false"
      aria-labelledby="incoming-call-title"
      aria-describedby="incoming-call-desc"
      onKeyDown={(e) => {
        if (e.key === 'Escape') sp.rejectIncoming();
        if (e.key === 'Enter') sp.acceptIncoming();
      }}
    >
      <div className="w-80 overflow-hidden rounded-xl border border-yellow-300 bg-white shadow-2xl dark:border-yellow-700 dark:bg-gray-800">
        <div className="h-1 bg-yellow-500 motion-safe:animate-pulse" />
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/30">
              <PhoneIncoming size={20} className="text-yellow-600 dark:text-yellow-400 motion-safe:animate-bounce" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p id="incoming-call-title" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Llamada entrante
              </p>
              <p id="incoming-call-desc" className="truncate text-xs text-gray-600 dark:text-gray-300" aria-live="assertive">
                {caller?.name ? `${caller.name} · ${incoming.from}` : incoming.from}
                {caller?.opportunity ? ` · ${caller.opportunity}` : ''}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button ref={acceptRef} onClick={sp.acceptIncoming} size="sm" className="flex-1 bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700">
              <Phone size={14} className="mr-1.5" aria-hidden="true" />
              Aceptar (⏎)
            </Button>
            <Button onClick={sp.rejectIncoming} size="sm" variant="destructive" className="flex-1">
              <PhoneOff size={14} className="mr-1.5" aria-hidden="true" />
              Rechazar (Esc)
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
