'use client';

/**
 * Llamadas — /app/crm/llamadas (FASE-03 §5.1; Figma 1351:18).
 *
 * La pantalla entera es `CallsTable` (kit): cabecera, cifras del rango, filtros
 * (incluida la búsqueda por transcripción), tabla, paginación y hoja de
 * detalle. El softphone global vive en el shell; «Llamar» lo despliega.
 * `?call={id}` (enlaces viejos: timeline, objeciones, campañas de voz) lleva al
 * detalle de esa llamada, /app/crm/llamadas/[id] (Figma 1363:20).
 */

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CallsTable, rutaDetalleLlamada } from '@/components/voice/CallsTable';
import { useSoftphone } from '@/components/voice/SoftphoneProvider';

function LlamadasContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const openCallId = searchParams?.get('call') ?? null;
  const sp = useSoftphone();
  const [refreshKey, setRefreshKey] = useState(0);

  // Al cerrar el diálogo de disposición de una llamada recién terminada se
  // recarga el listado. `lastEnded` también es null en el primer render: el
  // centinela evita recargar al montar.
  const lastEnded = sp.available ? sp.lastEndedCall : null;
  const hadEndedCall = useRef(false);
  useEffect(() => {
    if (lastEnded) {
      hadEndedCall.current = true;
      return;
    }
    if (!hadEndedCall.current) return;
    hadEndedCall.current = false;
    setRefreshKey((k) => k + 1);
  }, [lastEnded]);

  useEffect(() => {
    if (openCallId) router.replace(rutaDetalleLlamada(openCallId));
  }, [openCallId, router]);

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col gap-4 bg-canvas p-4 lg:p-6">
      <CallsTable refreshKey={refreshKey} />
    </div>
  );
}

export default function LlamadasPage() {
  return (
    <Suspense fallback={null}>
      <LlamadasContent />
    </Suspense>
  );
}
