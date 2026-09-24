'use client';

import { use } from 'react';
import CuentaPorPagarDetalle from '@/components/finanzas/cuentas-por-pagar/detalle/CuentaPorPagarDetalle';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CuentaPorPagarDetailPageRoute({ params }: PageProps) {
  const { id } = use(params);
  return <CuentaPorPagarDetalle id={id} />;
}
