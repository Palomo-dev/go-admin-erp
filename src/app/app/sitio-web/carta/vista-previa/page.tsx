'use client';

/** /app/sitio-web/carta/vista-previa — «Ver como» por sede, día y hora (F-flujos/1 paso 4). */
import { Suspense } from 'react';
import { VistaPreviaCarta } from '@/components/sitio-web/configuracion/carta/VistaPreviaCarta';

export default function VistaPreviaCartaPage() {
  return (
    <Suspense>
      <VistaPreviaCarta />
    </Suspense>
  );
}
