'use client';

import React from 'react';
import FormularioFacturaVenta from '@/components/finanzas/facturas-venta/formulario/FormularioFacturaVenta';

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Editar un borrador (o ver en solo lectura una emitida o anulada): el mismo formulario v2. */
export default function EditarFacturaVentaPage({ params }: PageProps) {
  const { id } = React.use(params);
  return (
    <div className="p-4 sm:p-6">
      <FormularioFacturaVenta id={id} />
    </div>
  );
}
