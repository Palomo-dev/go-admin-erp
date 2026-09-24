'use client';

import { use } from 'react';
import FormularioFacturaCompra from '@/components/finanzas/facturas-compra/formulario/FormularioFacturaCompra';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EditarFacturaPage({ params }: PageProps) {
  const { id } = use(params);
  return <FormularioFacturaCompra id={id} />;
}
