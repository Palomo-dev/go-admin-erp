'use client';

import React from 'react';
import { EditarFacturaVenta } from '@/components/finanzas/facturas-venta/editar/EditarFacturaVenta';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function EditarFacturaPage({ params }: PageProps) {
  const { id } = React.use(params);
  return <EditarFacturaVenta facturaId={id} />;
}
