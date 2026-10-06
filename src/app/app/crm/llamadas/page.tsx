'use client';

/**
 * Llamadas — /app/crm/llamadas (FASE-03 §5.1; Figma 1351:18).
 *
 * La pantalla entera es `CallsTable` (kit): cabecera, cifras del rango, filtros
 * (incluida la búsqueda por transcripción), tabla, paginación y hoja de
 * detalle. El softphone global vive en el shell; «Llamar» lo despliega.
 * `?call={id}` abre esa llamada en la hoja y se quita al cerrarla.
 */

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CallsTable } from '@/components/voice/CallsTable';
import { useSoftphone } from '@/components/voice/SoftphoneProvider';

function LlamadasContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
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

  const quitarParametro = useCallback(() => {
    if (!openCallId || !searchParams) return;
    const p = new URLSearchParams(searchParams.toString());
    p.delete('call');
    const ruta = pathname ?? '/app/crm/llamadas';
    router.replace(p.size ? `${ruta}?${p}` : ruta, { scroll: false });
  }, [openCallId, pathname, router, searchParams]);

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col gap-4 bg-canvas p-4 lg:p-6">
      <CallsTable openCallId={openCallId} refreshKey={refreshKey} onCerrarLlamada={quitarParametro} />
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
