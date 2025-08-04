'use client';

import React from 'react';
import { DetalleFacturaCompra } from '@/components/finanzas/facturas-compra/id/DetalleFacturaCompra';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function DetalleFacturaPage({ params }: PageProps) {
  const { id } = React.use(params);
  return <DetalleFacturaCompra facturaId={id} />;
}
