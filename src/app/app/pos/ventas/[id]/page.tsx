'use client';

import { Suspense, use } from 'react';
import { VentaDetallePage } from '@/components/pos/ventas/detalle/VentaDetallePage';

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Detalle de venta: la URL no cambia (`/app/pos/ventas/{uuid}`); el servidor valida el id. */
export default function VentaDetalleRoute({ params }: PageProps) {
  const { id } = use(params);
  return (
    <Suspense>
      <VentaDetallePage ventaId={id} />
    </Suspense>
  );
}
