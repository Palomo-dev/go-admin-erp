'use client';

import { Suspense, use } from 'react';
import { DevolucionDetallePage } from '@/components/pos/devoluciones/DevolucionDetallePage';

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Detalle de una devolución (`/app/pos/devoluciones/{id}`); el servidor valida el id y la organización. */
export default function DevolucionDetalleRoute({ params }: PageProps) {
  const { id } = use(params);
  return (
    <Suspense>
      <DevolucionDetallePage devolucionId={id} />
    </Suspense>
  );
}
