'use client';

import React from 'react';
import { EditarFacturaCompra } from '@/components/finanzas/facturas-compra/editar/EditarFacturaCompra';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function EditarFacturaInventarioPage({ params }: PageProps) {
  const { id } = React.use(params);
  return <EditarFacturaCompra facturaId={id} />;
}
