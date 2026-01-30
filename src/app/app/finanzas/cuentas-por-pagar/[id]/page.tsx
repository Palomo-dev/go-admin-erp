'use client';

import { use } from 'react';
import { CuentaPorPagarDetailPage } from '@/components/finanzas/cuentas-por-pagar/id';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CuentaPorPagarDetailPageRoute({ params }: PageProps) {
  const resolvedParams = use(params);
  
  return <CuentaPorPagarDetailPage accountId={resolvedParams.id} />;
}
