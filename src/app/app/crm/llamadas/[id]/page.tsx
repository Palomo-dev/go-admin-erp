'use client';

/**
 * Detalle de una llamada — /app/crm/llamadas/[id] (Figma 1363:20, 1365:800947,
 * 1365:801445 y 1368:17). Toda la pantalla vive en `LlamadaDetalle`.
 */

import { useParams } from 'next/navigation';
import { LlamadaDetalle } from '@/components/voice/detalle/LlamadaDetalle';

export default function LlamadaDetallePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  return (
    <div className="flex min-h-full w-full min-w-0 flex-col gap-4 bg-canvas p-4 lg:p-6">
      {id && <LlamadaDetalle key={id} callId={id} />}
    </div>
  );
}
