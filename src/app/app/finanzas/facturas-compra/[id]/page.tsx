'use client';

import { use } from 'react';
import DetalleFacturaCompraV2 from '@/components/finanzas/facturas-compra/detalle/DetalleFacturaCompraV2';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function DetalleFacturaPage({ params }: PageProps) {
  const { id } = use(params);
  return (
    // Mismo margen que el resto de pantallas rediseñadas (p-4 · sm:p-6): el
    // componente no lo trae y todo quedaba pegado al borde (2026-09-28).
    <div className="p-4 sm:p-6">
      <DetalleFacturaCompraV2 id={id} />
    </div>
  );
}
