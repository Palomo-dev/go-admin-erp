'use client';

import { use } from 'react';
import DetalleFacturaCompraV2 from '@/components/finanzas/facturas-compra/detalle/DetalleFacturaCompraV2';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function DetalleFacturaPage({ params }: PageProps) {
  const { id } = use(params);
  return <DetalleFacturaCompraV2 id={id} />;
}
