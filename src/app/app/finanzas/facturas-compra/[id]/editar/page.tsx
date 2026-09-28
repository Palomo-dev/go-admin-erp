'use client';

import { use } from 'react';
import FormularioFacturaCompra from '@/components/finanzas/facturas-compra/formulario/FormularioFacturaCompra';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EditarFacturaPage({ params }: PageProps) {
  const { id } = use(params);
  return (
    // Mismo margen que el resto de pantallas rediseñadas (p-4 · sm:p-6): el
    // componente no lo trae y todo quedaba pegado al borde (2026-09-28).
    <div className="p-4 sm:p-6">
      <FormularioFacturaCompra id={id} />
    </div>
  );
}
